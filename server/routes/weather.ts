import { Router } from "express";
import { getForecast, getWeatherSummary } from "../../src/server/bomWeather";

// Weather and forecast — per-state so a WA job isn't judged by Sydney's sky.
export const weatherRouter = Router();

weatherRouter.get("/weather/forecast", (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  res.json(getForecast(state));
});

// GET /api/v1/weather/summary — compact "current conditions" chip per state,
// used to paint a small weather indicator on each Timeline row.
weatherRouter.get("/weather/summary", (_req, res) => {
  res.json(getWeatherSummary());
});
