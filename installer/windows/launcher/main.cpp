#include <windows.h>
#include <appmodel.h>
#include <bcrypt.h>
#include <dpapi.h>
#include <shellapi.h>
#include <shlobj.h>

#include <array>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iterator>
#include <sstream>
#include <string>
#include <vector>

namespace {
namespace fs = std::filesystem;

fs::path executablePath()
{
	std::vector<wchar_t> buffer(32768);
	const DWORD length = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
	if (length == 0 || length >= buffer.size())
		return {};
	return fs::path(std::wstring(buffer.data(), length));
}

fs::path packageDataPath(const fs::path &fallback)
{
	std::vector<wchar_t> configured(32768);
	const DWORD configuredLength = GetEnvironmentVariableW(L"OBS_CREATOR_ASSISTANT_DATA_ROOT",
								configured.data(), static_cast<DWORD>(configured.size()));
	if (configuredLength > 0 && configuredLength < configured.size())
		return fs::path(std::wstring(configured.data(), configuredLength));

	UINT32 familyLength = 0;
	const LONG familyResult = GetCurrentPackageFamilyName(&familyLength, nullptr);
	if (familyResult != ERROR_INSUFFICIENT_BUFFER)
		return fallback;

	std::vector<wchar_t> family(familyLength);
	if (GetCurrentPackageFamilyName(&familyLength, family.data()) != ERROR_SUCCESS)
		return fallback;

	wchar_t *localAppData = nullptr;
	if (SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &localAppData) != S_OK)
		return fallback;
	const fs::path result = fs::path(localAppData) / L"Packages" / family.data() / L"LocalState";
	CoTaskMemFree(localAppData);
	std::error_code error;
	fs::create_directories(result, error);
	return error ? fallback : result;
}

std::vector<unsigned char> readBinary(const fs::path &file)
{
	std::ifstream input(file, std::ios::binary);
	return input ? std::vector<unsigned char>(std::istreambuf_iterator<char>(input), {})
		     : std::vector<unsigned char>{};
}

bool writeBinary(const fs::path &file, const DATA_BLOB &blob)
{
	std::error_code error;
	fs::create_directories(file.parent_path(), error);
	std::ofstream output(file, std::ios::binary | std::ios::trunc);
	output.write(reinterpret_cast<const char *>(blob.pbData), blob.cbData);
	return output.good();
}

std::string readOrCreateBridgeToken(const fs::path &root)
{
	const fs::path secretPath = root / L"config" / L"bridge-token.dat";
	std::vector<unsigned char> encrypted = readBinary(secretPath);
	if (encrypted.empty()) {
		std::array<unsigned char, 48> random{};
		if (BCryptGenRandom(nullptr, random.data(), static_cast<ULONG>(random.size()),
				    BCRYPT_USE_SYSTEM_PREFERRED_RNG) != 0)
			return {};
		DATA_BLOB plain{static_cast<DWORD>(random.size()), random.data()};
		DATA_BLOB protectedData{};
		if (!CryptProtectData(&plain, L"OBS Creator Assistant local bridge", nullptr, nullptr, nullptr,
				      CRYPTPROTECT_UI_FORBIDDEN, &protectedData))
			return {};
		const bool saved = writeBinary(secretPath, protectedData);
		LocalFree(protectedData.pbData);
		if (!saved)
			return {};
		encrypted = readBinary(secretPath);
	}

	DATA_BLOB protectedData{static_cast<DWORD>(encrypted.size()), encrypted.data()};
	DATA_BLOB plain{};
	if (!CryptUnprotectData(&protectedData, nullptr, nullptr, nullptr, nullptr,
				CRYPTPROTECT_UI_FORBIDDEN, &plain))
		return {};
	std::ostringstream token;
	token << std::hex << std::setfill('0');
	for (DWORD index = 0; index < plain.cbData; ++index)
		token << std::setw(2) << static_cast<unsigned int>(plain.pbData[index]);
	SecureZeroMemory(plain.pbData, plain.cbData);
	LocalFree(plain.pbData);
	return token.str();
}

int printBridgeToken(const fs::path &root)
{
	const std::string token = readOrCreateBridgeToken(root);
	if (token.empty())
		return ERROR_CANNOT_MAKE;
	DWORD written = 0;
	return WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), token.data(), static_cast<DWORD>(token.size()),
			 &written, nullptr) && written == token.size() ? 0 : ERROR_WRITE_FAULT;
}

bool samePath(const fs::path &left, const fs::path &right)
{
	const auto leftText = fs::absolute(left).lexically_normal().wstring();
	const auto rightText = fs::absolute(right).lexically_normal().wstring();
	return CompareStringOrdinal(leftText.c_str(), -1, rightText.c_str(), -1, TRUE) == CSTR_EQUAL;
}

void createStopSentinel(const fs::path &root)
{
	std::ofstream(root / L".stop", std::ios::trunc) << "stop\n";
}

DWORD readProcessId(const fs::path &root)
{
	std::ifstream input(root / L".bridge.pid");
	unsigned long processId = 0;
	input >> processId;
	return static_cast<DWORD>(processId);
}

int stopAssistant(const fs::path &root)
{
	createStopSentinel(root);
	const DWORD processId = readProcessId(root);
	if (processId == 0)
		return 0;

	HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | SYNCHRONIZE,
				     FALSE, processId);
	if (!process)
		return 0;

	std::vector<wchar_t> pathBuffer(32768);
	DWORD pathLength = static_cast<DWORD>(pathBuffer.size());
	const bool isExpectedProcess = QueryFullProcessImageNameW(process, 0, pathBuffer.data(), &pathLength) &&
		samePath(fs::path(std::wstring(pathBuffer.data(), pathLength)), root / L"runtime" / L"node.exe");
	if (isExpectedProcess) {
		TerminateProcess(process, 0);
		WaitForSingleObject(process, 5000);
	}
	CloseHandle(process);
	return 0;
}

int startAssistant(const fs::path &appRoot, const fs::path &dataRoot, bool openSetup)
{
	HANDLE mutex = CreateMutexW(nullptr, FALSE, L"Local\\TPCGlobal.OBSCreatorAssistant.Launcher");
	if (!mutex || GetLastError() == ERROR_ALREADY_EXISTS) {
		if (mutex)
			CloseHandle(mutex);
		return 0;
	}

	std::error_code error;
	fs::remove(dataRoot / L".stop", error);
	const fs::path node = appRoot / L"runtime" / L"node.exe";
	const fs::path bootstrap = appRoot / L"dist" / L"bootstrap.js";
	if (!fs::exists(node) || !fs::exists(bootstrap)) {
		CloseHandle(mutex);
		return ERROR_FILE_NOT_FOUND;
	}

	std::wstring command = L"\"" + node.wstring() + L"\" \"" + bootstrap.wstring() + L"\"";
	std::vector<wchar_t> commandBuffer(command.begin(), command.end());
	commandBuffer.push_back(L'\0');

	STARTUPINFOW startup{};
	startup.cb = sizeof(startup);
	PROCESS_INFORMATION process{};
	SetEnvironmentVariableW(L"OBS_CREATOR_ASSISTANT_PACKAGE_ROOT", appRoot.c_str());
	SetEnvironmentVariableW(L"OBS_CREATOR_ASSISTANT_DATA_ROOT", dataRoot.c_str());
	const BOOL started = CreateProcessW(node.c_str(), commandBuffer.data(), nullptr, nullptr, FALSE,
					    CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, nullptr,
					    dataRoot.c_str(), &startup, &process);
	if (!started) {
		CloseHandle(mutex);
		return static_cast<int>(GetLastError());
	}

	CloseHandle(process.hThread);
	if (openSetup) {
		Sleep(750);
		ShellExecuteW(nullptr, L"open", L"http://127.0.0.1:8788/", nullptr, nullptr, SW_SHOWNORMAL);
	}
	WaitForSingleObject(process.hProcess, INFINITE);
	DWORD exitCode = 0;
	GetExitCodeProcess(process.hProcess, &exitCode);
	CloseHandle(process.hProcess);
	CloseHandle(mutex);
	return static_cast<int>(exitCode);
}
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR commandLine, int)
{
	const fs::path root = executablePath().parent_path();
	if (root.empty())
		return ERROR_PATH_NOT_FOUND;
	const fs::path dataRoot = packageDataPath(root);
	const bool packaged = !samePath(root, dataRoot);
	const bool backgroundEntry = executablePath().filename() == L"OBS-Creator-Assistant-Background.exe";
	const std::wstring arguments(commandLine);
	if (arguments.find(L"--read-bridge-token") != std::wstring::npos)
		return printBridgeToken(dataRoot);
	return arguments.find(L"--stop") != std::wstring::npos ? stopAssistant(dataRoot)
								       : startAssistant(root, dataRoot, packaged && !backgroundEntry);
}

