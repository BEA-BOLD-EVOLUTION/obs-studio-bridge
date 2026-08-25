cmake_minimum_required(VERSION 3.24)
project(obs_creator_assistant_launcher VERSION 1.4.0 LANGUAGES CXX RC)

configure_file(version.rc.in version.rc @ONLY)

add_executable(OBS-Creator-Assistant WIN32 main.cpp "${CMAKE_CURRENT_BINARY_DIR}/version.rc")
target_compile_features(OBS-Creator-Assistant PRIVATE cxx_std_17)
target_compile_definitions(OBS-Creator-Assistant PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
target_link_libraries(OBS-Creator-Assistant PRIVATE bcrypt crypt32 shell32)

if(MSVC)
  target_compile_options(OBS-Creator-Assistant PRIVATE /W4 /WX /guard:cf /sdl)
  target_link_options(OBS-Creator-Assistant PRIVATE /guard:cf /DYNAMICBASE /NXCOMPAT)
endif()

