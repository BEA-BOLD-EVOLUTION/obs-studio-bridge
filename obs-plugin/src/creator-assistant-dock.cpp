#include "creator-assistant-dock.hpp"

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
#include <QVBoxLayout>

namespace {
constexpr auto HealthUrl = "http://127.0.0.1:8787/health";
constexpr auto OnboardingUrl = "http://127.0.0.1:8788/";
constexpr auto DownloadUrl = "https://obs.boldevolution.net/download";
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
	layout->addStretch();

	auto *privacy = new QLabel(
		tr("ChatGPT connects through the secure Creator Assistant relay. OBS passwords and local settings stay on this computer."),
		this);
	privacy->setWordWrap(true);
	privacy->setStyleSheet(QStringLiteral("color: palette(mid);"));
	layout->addWidget(privacy);

	connect(startButton_, &QPushButton::clicked, this, [this] { startAssistant(); });
	connect(openButton_, &QPushButton::clicked, this, [this] { openAssistant(); });
	connect(refreshButton, &QPushButton::clicked, this, [this] { refreshStatus(); });

	refreshTimer_ = new QTimer(this);
	refreshTimer_->setInterval(3000);
	connect(refreshTimer_, &QTimer::timeout, this, [this] { refreshStatus(); });
	refreshTimer_->start();
	refreshStatus();
}

QString CreatorAssistantDock::assistantRoot() const
{
	return QDir::cleanPath(qEnvironmentVariable("LOCALAPPDATA") + QStringLiteral("/OBS Creator Assistant"));
}

QString CreatorAssistantDock::assistantLauncher() const
{
	return QDir(assistantRoot()).filePath(QStringLiteral("OBS-Creator-Assistant.exe"));
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

void CreatorAssistantDock::startAssistant()
{
	const QString launcher = assistantLauncher();
	if (!QFileInfo::exists(launcher)) {
		showDisconnected();
		return;
	}

	QProcess::startDetached(launcher, {}, assistantRoot());
	status_->setText(tr("Starting…"));
	QTimer::singleShot(1500, this, [this] { refreshStatus(); });
}

void CreatorAssistantDock::openAssistant()
{
	const bool installed = QFileInfo::exists(assistantLauncher());
	QDesktopServices::openUrl(
		QUrl(QString::fromLatin1(installed ? OnboardingUrl : DownloadUrl)));
}

