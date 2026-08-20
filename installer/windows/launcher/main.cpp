#include <windows.h>

#include <filesystem>
#include <fstream>
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

int startAssistant(const fs::path &root)
{
	HANDLE mutex = CreateMutexW(nullptr, FALSE, L"Local\\TPCGlobal.OBSCreatorAssistant.Launcher");
	if (!mutex || GetLastError() == ERROR_ALREADY_EXISTS) {
		if (mutex)
			CloseHandle(mutex);
		return 0;
	}

	std::error_code error;
	fs::remove(root / L".stop", error);
	const fs::path node = root / L"runtime" / L"node.exe";
	const fs::path bootstrap = root / L"dist" / L"bootstrap.js";
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
	const BOOL started = CreateProcessW(node.c_str(), commandBuffer.data(), nullptr, nullptr, FALSE,
					    CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, nullptr,
					    root.c_str(), &startup, &process);
	if (!started) {
		CloseHandle(mutex);
		return static_cast<int>(GetLastError());
	}

	CloseHandle(process.hThread);
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
	return std::wstring(commandLine).find(L"--stop") != std::wstring::npos ? stopAssistant(root)
									    : startAssistant(root);
}

