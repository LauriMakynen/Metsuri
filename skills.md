# Metsuri Coding Assistant Guide

## Product purpose

Metsuri is a web and mobile forest-management app for people who own, maintain, and sell forests. Owners should be able to view their properties on a map, inspect aerial imagery, select areas being worked on, record the work and its date, and review the property's maintenance history.

The app can suggest when a follow-up or maintenance task may be due. Longer-term recommendations may use forest type, land type, and rainfall. Treat those inputs and any resulting schedules as product requirements to clarify with the user before implementing forestry rules. Do not invent forestry assumptions or present unverified suggestions as authoritative advice.

## Product knowledge and current state

- The app is intended for both desktop and mobile use.
- Forest properties and work areas are represented on a map. Map layers include map and orthophoto imagery; check the existing implementation before changing available layers or their providers.
- The product goal includes recording work such as thinning, planting, harvesting, road work, and inspections.
- The current README documents five marking categories: brush clearing, planting, thinning, clear-cutting, and other work. Preserve the existing taxonomy unless the user approves a change.
- The current README describes follow-up intervals as preliminary, indicative defaults based on marking type—not as an official forest assessment.
- Forest-data and valuation endpoints are documented as placeholders, not completed integrations. Confirm scope and data sources before treating them as implemented.
- Read the project README and relevant source files before relying on assumptions about behavior.

## Technology and structure

- Frontend: React, TypeScript, and Vite.
- Mapping and geometry: Leaflet, Leaflet Draw, and Turf.js.
- Backend: Node.js, Express, and TypeScript.
- Database: PostgreSQL with PostGIS.
- API data uses GeoJSON where appropriate; authentication uses JWT.
- `frontend/src/` contains the UI, pages, services, hooks, types, and utilities.
- `backend/src/` contains API routes, services, database code, and authentication middleware.
- `database/` contains database initialization and schema-related files.

Follow the established patterns and types in the relevant part of the app. Keep changes focused, preserve existing behavior, and update directly related documentation when behavior changes.

## Language and UX

- Keep user-facing app text in Finnish unless the user requests another language.
- Use English for code identifiers and developer documentation.
- Preserve the app's responsive behavior for desktop, tablet, and mobile.
- Make errors and unavailable data clear to users; do not show placeholder or mock data as real data.

## Dependencies and external services

- Do not add a package dependency or introduce a new external service/API without asking the user and receiving approval first.
- Prefer existing packages, integrations, and project utilities where they meet the requirement.
- Never hard-code API keys, credentials, or other secrets. Use the existing environment-variable configuration and do not commit local `.env` files.
- The app has Maanmittauslaitos (MML) map/cadastre integration points. Check the existing setup and configuration before changing them.

## Development and verification

Run commands from `forest-care-app/` or the relevant package directory:

- Start the local app using `./start.sh` when its Docker and environment prerequisites are available.
- Frontend checks: `cd frontend && npm run lint` and `npm run build`.
- Backend check: `cd backend && npm run build`.
- The package manifests do not define automated test scripts. Do not claim tests were run unless an available test suite was actually executed.
- Run the checks relevant to the change and report what passed, failed, or could not be run.
- For UI or workflow changes, verify the affected flow in the app when a working local environment is available.
