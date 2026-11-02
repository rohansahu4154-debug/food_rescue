# Food Rescue frontend

This React, TypeScript, and Vite frontend connects to the FoodRescue API.
By default, the API URL is `http://localhost:8000` during local development;
set `VITE_API_URL` in a local `.env` file to use a different backend URL.
Restart Vite after changing the value. Production builds require
`VITE_API_URL` to be set to the deployed API origin; localhost is rejected by
the production frontend.

From this directory, run `npm ci` and `npm run dev` to start the development
server. Run `npm run lint` and `npm run build` to check the code. For
instructions to start the backend too, see the [project README](../README.md).
