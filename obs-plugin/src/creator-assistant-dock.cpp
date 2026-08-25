#include "creator-assistant-dock.hpp"

#include <QComboBox>
#include <QDesktopServices>
#include <QDir>
#include <QFileInfo>
#include <QHBoxLayout>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLabel>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QProcess>
#include <QPushButton>
#include <QTimer>
#include <QUrl>
#include <QUrlQuery>
#include <QVBoxLayout>

namespace {
constexpr auto HealthUrl = "http://127.0.0.1:8787/health";
constexpr auto ClipperStatusUrl = "http://127.0.0.1:8789/clipper/status";
constexpr auto ClipperEnableUrl = "http://127.0.0.1:8789/clipper/enable";
constexpr auto ClipperSaveUrl = "http://127.0.0.1:8789/clipper/save";
constexpr auto OnboardingUrl = "http://127.0.0.1:8788/";
constexpr auto DownloadUrl = "https://obs.boldevolution.net/download";

QNetworkRequest clipperRequest(const QUrl &url)
{
	QNetworkRequest request(url);
	request.setRawHeader("X-OBS-Creator-Assistant", "1");
	request.setHeader(QNetworkRequest::ContentTypeHeader, QStringLiteral("application/json"));
	return request;
}
}

CreatorAssistantDock::CreatorAssistantDock(QWidget *parent) : QWidget(parent)
{
	auto *layout = new QVBoxLayout(this);
	layout->setContentsMargins(16, 16, 16, 16);
	layout->setSpacing(12);

	auto *title = new QLabel(tr("OBS Creator Assistant"), this);
	auto titleFont = title->font();
	titleFont.setBold(true);
	titleFont.setPointSize(titleFont.pointSize() + 2);
	title->setFont(titleFont);
	layout->addWidget(title);

	status_ = new QLabel(tr("Checking connection…"), this);
	auto statusFont = status_->font();
	statusFont.setBold(true);
	status_->setFont(statusFont);
	layout->addWidget(status_);

	details_ = new QLabel(tr("Waiting for the local Creator Assistant."), this);
	details_->setWordWrap(true);
	layout->addWidget(details_);

	auto *buttons = new QHBoxLayout();
	startButton_ = new QPushButton(tr("Start Assistant"), this);
	openButton_ = new QPushButton(tr("Open Setup"), this);
	auto *refreshButton = new QPushButton(tr("Refresh"), this);
	buttons->addWidget(startButton_);
	buttons->addWidget(openButton_);
	buttons->addWidget(refreshButton);
	layout->addLayout(buttons);

	auto *divider = new QLabel(tr("CLIPPING"), this);
	auto dividerFont = divider->font();
	dividerFont.setBold(true);
	divider->setFont(dividerFont);
	layout->addWidget(divider);

	auto *modeRow = new QHBoxLayout();
	auto *modeLabel = new QLabel(tr("Clip source:"), this);
	clipMode_ = new QComboBox(this);
	clipMode_->addItem(tr("Program View"), QStringLiteral("program"));
	clipMode_->addItem(tr("Viewer View"), QStringLiteral("viewer"));
	modeRow->addWidget(modeLabel);
	modeRow->addWidget(clipMode_, 1);
	layout->addLayout(modeRow);

	clipperStatus_ = new QLabel(tr("Checking clipping…"), this);
	auto clipperFont = clipperStatus_->font();
	clipperFont.setBold(true);
	clipperStatus_->setFont(clipperFont);
	layout->addWidget(clipperStatus_);

	clipperDetails_ = new QLabel(
		tr("Program View saves the normal OBS output. Viewer View saves the dedicated phone-view feed with TikTok chat and mobile UI."),
		this);
	clipperDetails_->setWordWrap(true);
	layout->addWidget(clipperDetails_);

	auto *clipperButtons = new QHBoxLayout();
	enableClipperButton_ = new QPushButton(tr("Enable Clipping"), this);
	clipButton_ = new QPushButton(tr("CLIP THIS"), this);
	clipButton_->setMinimumHeight(42);
	clipButton_->setEnabled(false);
	clipperButtons->addWidget(enableClipperButton_);
	clipperButtons->addWidget(clipButton_);
	layout->addLayout(clipperButtons);

	layout->addStretch();

	auto *privacy = new QLabel(
		tr("ChatGPT connects through the secure Creator Assistant relay. OBS passwords and local settings stay on this computer. TikTok credentials remain on the viewer phone when Viewer View is used."),
		this);
	privacy->setWordWrap(true);
	privacy->setStyleSheet(QStringLiteral("color: palette(mid);"));
	layout->addWidget(privacy);

	connect(startButton_, &QPushButton::clicked, this, [this] { startAssistant(); });
	connect(openButton_, &QPushButton::clicked, this, [this] { openAssistant(); });
	connect(refreshButton, &QPushButton::clicked, this, [this] {
		refreshStatus();
		refreshClipperStatus();
	});
	connect(clipMode_, &QComboBox::currentIndexChanged, this, [this] { refreshClipperStatus(); });
	connect(enableClipperButton_, &QPushButton::clicked, this, [this] { enableClipping(); });
	connect(clipButton_, &QPushButton::clicked, this, [this] { saveClip(); });

	refreshTimer_ = new QTimer(this);
	refreshTimer_->setInterval(3000);
	connect(refreshTimer_, &QTimer::timeout, this, [this] {
		refreshStatus();
		refreshClipperStatus();
	});
	refreshTimer_->start();
	refreshStatus();
	refreshClipperStatus();
}

QString CreatorAssistantDock::assistantRoot() const
{
	return QDir::cleanPath(qEnvironmentVariable("LOCALAPPDATA") + QStringLiteral("/OBS Creator Assistant"));
}

QString CreatorAssistantDock::assistantLauncher() const
{
	return QDir(assistantRoot()).filePath(QStringLiteral("OBS-Creator-Assistant.exe"));
}

QString CreatorAssistantDock::selectedClipMode() const
{
	return clipMode_ ? clipMode_->currentData().toString() : QStringLiteral("program");
}

void CreatorAssistantDock::refreshStatus()
{
	if (requestPending_)
		return;

	requestPending_ = true;
	auto *reply = network_.get(QNetworkRequest(QUrl(QString::fromLatin1(HealthUrl))));
	connect(reply, &QNetworkReply::finished, this, [this, reply] {
		requestPending_ = false;
		if (reply->error() == QNetworkReply::NoError)
			showConnected(reply->readAll());
		else
			showDisconnected();
		reply->deleteLater();
	});
}

void CreatorAssistantDock::refreshClipperStatus()
{
	if (clipperRequestPending_)
		return;

	clipperRequestPending_ = true;
	QUrl url(QString::fromLatin1(ClipperStatusUrl));
	QUrlQuery query;
	query.addQueryItem(QStringLiteral("mode"), selectedClipMode());
	url.setQuery(query);
	auto *reply = network_.get(clipperRequest(url));
	connect(reply, &QNetworkReply::finished, this, [this, reply] {
		clipperRequestPending_ = false;
		const QByteArray payload = reply->readAll();
		if (reply->error() == QNetworkReply::NoError)
			showClipperStatus(payload);
		else {
			const auto object = QJsonDocument::fromJson(payload).object();
			showClipperDisconnected(object.value(QStringLiteral("error")).toString());
		}
		reply->deleteLater();
	});
}

void CreatorAssistantDock::showConnected(const QByteArray &payload)
{
	const auto document = QJsonDocument::fromJson(payload);
	const auto object = document.object();
	const bool obsConnected = object.value(QStringLiteral("obsConnected")).toBool(false);

	status_->setText(obsConnected ? tr("● Connected") : tr("● Assistant running"));
	status_->setStyleSheet(QStringLiteral("color: #2ea043;"));
	details_->setText(obsConnected ? tr("ChatGPT can reach this OBS computer.")
				       : tr("Open OBS WebSocket settings to finish the local connection."));
	startButton_->setEnabled(false);
	openButton_->setEnabled(true);
	openButton_->setText(tr("Open Setup"));
}

void CreatorAssistantDock::showDisconnected()
{
	const bool installed = QFileInfo::exists(assistantLauncher());
	status_->setText(installed ? tr("● Assistant offline") : tr("● Setup required"));
	status_->setStyleSheet(QStringLiteral("color: #d29922;"));
	details_->setText(installed ? tr("Start the Creator Assistant to reconnect ChatGPT.")
				     : tr("Install the Creator Assistant desktop helper to connect this OBS computer."));
	startButton_->setEnabled(installed);
	openButton_->setEnabled(true);
	openButton_->setText(installed ? tr("Open Setup") : tr("Install Assistant"));
}

void CreatorAssistantDock::showClipperStatus(const QByteArray &payload)
{
	const auto object = QJsonDocument::fromJson(payload).object();
	const bool connected = object.value(QStringLiteral("connected")).toBool(false);
	const bool replayActive = object.value(QStringLiteral("replayBufferActive")).toBool(false);
	const QString sceneName = object.value(QStringLiteral("programSceneName")).toString();
	const QString mode = object.value(QStringLiteral("mode")).toString(selectedClipMode());

	if (!connected) {
		showClipperDisconnected();
		return;
	}

	const bool viewerMode = mode == QStringLiteral("viewer");
	clipperStatus_->setText(replayActive ? tr("● Clipping ready") : tr("● Connected — buffer off"));
	clipperStatus_->setStyleSheet(replayActive ? QStringLiteral("color: #2ea043;")
					       : QStringLiteral("color: #d29922;"));
	clipperDetails_->setText(sceneName.isEmpty()
				 ? (viewerMode ? tr("Viewer View is connected.") : tr("Program View is connected."))
				 : (viewerMode ? tr("Viewer View scene: %1").arg(sceneName)
					       : tr("Program View scene: %1").arg(sceneName)));
	enableClipperButton_->setEnabled(!replayActive);
	clipButton_->setEnabled(replayActive);
}

void CreatorAssistantDock::showClipperDisconnected(const QString &message)
{
	const bool viewerMode = selectedClipMode() == QStringLiteral("viewer");
	clipperStatus_->setText(viewerMode ? tr("● Viewer View not connected") : tr("● Program View not connected"));
	clipperStatus_->setStyleSheet(QStringLiteral("color: #d29922;"));
	clipperDetails_->setText(message.isEmpty()
				 ? (viewerMode
					? tr("Start the dedicated Viewer/Clipper OBS session. AirPlay, mirroring, and hardware capture are all supported.")
					: tr("Connect the main production OBS session to use Program View clipping."))
				 : message);
	enableClipperButton_->setEnabled(false);
	clipButton_->setEnabled(false);
}

void CreatorAssistantDock::startAssistant()
{
	const QString launcher = assistantLauncher();
	if (!QFileInfo::exists(launcher)) {
		showDisconnected();
		return;
	}

	QProcess::startDetached(launcher, {}, assistantRoot());
	status_->setText(tr("Starting…"));
	QTimer::singleShot(1500, this, [this] {
		refreshStatus();
		refreshClipperStatus();
	});
}

void CreatorAssistantDock::openAssistant()
{
	const bool installed = QFileInfo::exists(assistantLauncher());
	QDesktopServices::openUrl(
		QUrl(QString::fromLatin1(installed ? OnboardingUrl : DownloadUrl)));
}

void CreatorAssistantDock::enableClipping()
{
	if (clipperRequestPending_)
		return;

	clipperRequestPending_ = true;
	enableClipperButton_->setEnabled(false);
	QJsonObject body;
	body.insert(QStringLiteral("mode"), selectedClipMode());
	auto *reply = network_.post(clipperRequest(QUrl(QString::fromLatin1(ClipperEnableUrl))),
		QJsonDocument(body).toJson(QJsonDocument::Compact));
	connect(reply, &QNetworkReply::finished, this, [this, reply] {
		clipperRequestPending_ = false;
		const QByteArray payload = reply->readAll();
		if (reply->error() == QNetworkReply::NoError)
			showClipperStatus(payload);
		else {
			const auto object = QJsonDocument::fromJson(payload).object();
			showClipperDisconnected(object.value(QStringLiteral("error")).toString());
		}
		reply->deleteLater();
	});
}

void CreatorAssistantDock::saveClip()
{
	if (clipperRequestPending_)
		return;

	clipperRequestPending_ = true;
	clipButton_->setEnabled(false);
	clipperStatus_->setText(tr("Saving clip…"));
	const QString mode = selectedClipMode();
	QJsonObject body;
	body.insert(QStringLiteral("mode"), mode);
	auto *reply = network_.post(clipperRequest(QUrl(QString::fromLatin1(ClipperSaveUrl))),
		QJsonDocument(body).toJson(QJsonDocument::Compact));
	connect(reply, &QNetworkReply::finished, this, [this, reply, mode] {
		clipperRequestPending_ = false;
		const QByteArray payload = reply->readAll();
		if (reply->error() == QNetworkReply::NoError) {
			clipperStatus_->setText(tr("✓ Clip saved"));
			clipperStatus_->setStyleSheet(QStringLiteral("color: #2ea043;"));
			clipperDetails_->setText(mode == QStringLiteral("viewer")
				? tr("Saved the Viewer View replay buffer.")
				: tr("Saved the Program View replay buffer."));
			clipButton_->setEnabled(true);
			QTimer::singleShot(1500, this, [this] { refreshClipperStatus(); });
		} else {
			const auto object = QJsonDocument::fromJson(payload).object();
			clipperStatus_->setText(tr("Clip failed"));
			clipperStatus_->setStyleSheet(QStringLiteral("color: #cf222e;"));
			clipperDetails_->setText(object.value(QStringLiteral("error")).toString(tr("Could not save the clip.")));
			QTimer::singleShot(1500, this, [this] { refreshClipperStatus(); });
		}
		reply->deleteLater();
	});
}
