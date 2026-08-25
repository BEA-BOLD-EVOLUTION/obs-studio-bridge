#pragma once

#include <QByteArray>
#include <QNetworkAccessManager>
#include <QString>
#include <QWidget>

class QComboBox;
class QLabel;
class QPushButton;
class QTimer;

class CreatorAssistantDock final : public QWidget {
public:
	explicit CreatorAssistantDock(QWidget *parent = nullptr);

private:
	void refreshStatus();
	void refreshClipperStatus();
	void startAssistant();
	void openAssistant();
	void enableClipping();
	void saveClip();
	void showConnected(const QByteArray &payload);
	void showDisconnected();
	void showClipperStatus(const QByteArray &payload);
	void showClipperDisconnected(const QString &message = {});
	QString assistantRoot() const;
	QString assistantLauncher() const;
	QString selectedClipMode() const;

	QNetworkAccessManager network_;
	QLabel *status_ = nullptr;
	QLabel *details_ = nullptr;
	QLabel *clipperStatus_ = nullptr;
	QLabel *clipperDetails_ = nullptr;
	QComboBox *clipMode_ = nullptr;
	QPushButton *startButton_ = nullptr;
	QPushButton *openButton_ = nullptr;
	QPushButton *enableClipperButton_ = nullptr;
	QPushButton *clipButton_ = nullptr;
	QTimer *refreshTimer_ = nullptr;
	bool requestPending_ = false;
	bool clipperRequestPending_ = false;
};
