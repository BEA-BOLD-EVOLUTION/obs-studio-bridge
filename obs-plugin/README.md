# OBS Creator Assistant native plugin

This directory contains the native OBS Studio module for the Creator Assistant. It is intentionally a thin UI and lifecycle layer: OBS state remains available through the existing local bridge, while authentication and relay communication remain outside the OBS process.

## User experience

- Appears as **OBS Creator Assistant** under **Tools → Plugin Manager → Installed**.
- Adds an **OBS Creator Assistant** dock.
- Shows whether the desktop helper and OBS connection are online.
- Starts the installed helper and opens its local setup page.
- Supplies the OBS 32 `manifest.json` metadata used by Plugin Manager for the plugin name, version, description, and support links.

## Supported target

The first release targets Windows x64 and OBS Studio 31 or newer. It is built against the OBS 31.1.1 SDK using only stable frontend APIs and is validated on OBS Studio 32.2.1.

## Build

The repository workflow overlays this directory onto the official `obsproject/obs-plugintemplate` build environment and produces a Windows x64 artifact. This keeps the dependency versions and packaging layout aligned with OBS's supported template.

The artifact includes `Setup.cmd`. Running it with OBS closed installs the module into OBS's standard `%PROGRAMDATA%\obs-studio\plugins\obs-creator-assistant` directory. Restarting OBS makes it available in Plugin Manager and the Docks menu.
