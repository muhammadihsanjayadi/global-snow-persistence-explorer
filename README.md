# Global Snow Persistence Explorer

Interactive Google Earth Engine application for exploring annual snow persistence worldwide using ERA5-Land data.

The application aggregates daily snow cover by calendar year to calculate snow-covered days and annual snow persistence. Snow persistence is classified into four zones, while interactive tools provide global area estimates and location-specific information on snow persistence, snow-covered days, monthly mean snow water equivalent (SWE), and glacier or ice cap presence. The application supports complete calendar years from 1951 to 2025.

## Live Application

[Open the Global Snow Persistence Explorer](https://muhammadihsanjayadi34.users.earthengine.app/view/global-snow-persistence-explorer)

## Features

- Annual snow persistence mapping from 1951 to 2025
- Four snow persistence zones: Little or no snow, Intermittent snow, Seasonal snow, and Persistent snow
- Global area calculations for each persistence zone
- Location inspector for snow-covered days and annual snow persistence
- Monthly mean snow water equivalent (SWE)
- Glacier and ice cap context for selected locations

## Repository Structure

```text
global-snow-persistence-explorer/
├── src/
│   └── global_snow_persistence_explorer.js
├── docs/
│   └── project_overview.pdf
└── README.md