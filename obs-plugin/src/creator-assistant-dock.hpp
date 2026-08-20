#pragma once

#include <QByteArray>
#include <QNetworkAccessManager>
#include <QString>
#include <QWidget>

class QLabel;
class QPushButton;
class QTimer;

class CreatorAssistantDock final : public QWidget {
public:
	explicit CreatorAssistantDock(QWidget *parent = nullptr);

private:
	void refreshStatus();
	void startAssistant();
	void openAssistant();
	void showConnected(const QByteArray &payload);
	void showDisconnected();
	QString assistantRoot() const;
	QString assistantLauncher() const;

	QNetworkAccessManager network_;
	QLabel *status_ = nullptr;
	QLabel *details_ = nullptr;
	QPushButton *startButton_ = nullptr;
	QPushButton *openButton_ = nullptr;
	QTimer *refreshTimer_ = nullptr;
	bool requestPending_ = false;
};
