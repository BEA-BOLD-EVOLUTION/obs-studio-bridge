#include "creator-assistant-dock.hpp"

#include <obs-frontend-api.h>
#include <obs-module.h>
#include <plugin-support.h>

OBS_DECLARE_MODULE()
OBS_MODULE_USE_DEFAULT_LOCALE(PLUGIN_NAME, "en-US")
OBS_MODULE_AUTHOR("TPC Global LLC")

namespace {
constexpr auto DockId = "obs-creator-assistant-dock";
CreatorAssistantDock *dock = nullptr;
}

const char *obs_module_name(void)
{
	return "OBS Creator Assistant";
}

const char *obs_module_description(void)
{
	return "Connects OBS Studio to ChatGPT through the OBS Creator Assistant.";
}

bool obs_module_load(void)
{
	dock = new CreatorAssistantDock();
	if (!obs_frontend_add_dock_by_id(DockId, obs_module_text("Dock.Title"), dock)) {
		delete dock;
		dock = nullptr;
		obs_log(LOG_ERROR, "could not add the Creator Assistant dock");
		return false;
	}

	obs_log(LOG_INFO, "native plugin loaded (version %s)", PLUGIN_VERSION);
	return true;
}

void obs_module_unload(void)
{
	obs_frontend_remove_dock(DockId);
	dock = nullptr;
	obs_log(LOG_INFO, "native plugin unloaded");
}

