"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Feature } from "geojson";
import { ComposableMap, Geographies, Geography, Line, ZoomableGroup } from "react-simple-maps";
import { countriesByIso } from "@/lib/data";

interface EdgesMapProps {
  activeCountryIso: string;
  foundNeighbors: string[];
  celebration: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getViewport(activeCountryIso: string) {
  const country = countriesByIso[activeCountryIso];
  const focusCountries = [country.iso3, ...country.neighbors].map((iso3) => countriesByIso[iso3]);

  const minLng = Math.min(...focusCountries.map((item) => item.bbox[0]));
  const minLat = Math.min(...focusCountries.map((item) => item.bbox[1]));
  const maxLng = Math.max(...focusCountries.map((item) => item.bbox[2]));
  const maxLat = Math.max(...focusCountries.map((item) => item.bbox[3]));
  const lngSpan = maxLng - minLng;
  const latSpan = maxLat - minLat;
  const activeLngSpan = country.bbox[2] - country.bbox[0];
  const activeLatSpan = country.bbox[3] - country.bbox[1];
  const neighborCount = country.neighbors.length;
  const padding =
    neighborCount <= 2 ? 1.06 : neighborCount <= 4 ? 1.15 : neighborCount <= 7 ? 1.28 : 1.38;
  const frameWidth = Math.max(activeLngSpan * 2.2, lngSpan * padding, 5.2);
  const frameHeight = Math.max(activeLatSpan * 2.8, latSpan * (padding + 0.12), 4.4);
  const bboxCenterLng = (minLng + maxLng) / 2;
  const bboxCenterLat = (minLat + maxLat) / 2;

  return {
    center: [
      country.centroid[0] * 0.68 + bboxCenterLng * 0.32,
      country.centroid[1] * 0.64 + bboxCenterLat * 0.36,
    ] as [number, number],
    zoom: clamp(
      165 / Math.max(frameWidth, frameHeight * 1.18, 6.5),
      neighborCount <= 2 ? 4.5 : 3.4,
      14,
    ),
  };
}

export function EdgesMap({
  activeCountryIso,
  foundNeighbors,
  celebration,
}: EdgesMapProps) {
  const activeCountry = countriesByIso[activeCountryIso];
  const hiddenNeighbors = activeCountry.neighbors.filter((iso3) => !foundNeighbors.includes(iso3));
  const { center, zoom } = getViewport(activeCountryIso);

  return (
    <div
      aria-label={`Map of ${activeCountry.name} and its borders`}
      className="edges-map"
      data-testid="edges-map"
    >
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 150 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup center={center} zoom={zoom}>
          <Geographies geography="/data/world-193.geo.json">
            {({ geographies }: { geographies: Feature[] }) =>
              geographies.map((geography) => {
                const iso3 = String(geography.properties?.iso3 ?? "");
                const isActive = iso3 === activeCountryIso;
                const isFound = foundNeighbors.includes(iso3);
                const isHiddenNeighbor = hiddenNeighbors.includes(iso3);
                const fill = isActive
                  ? "var(--accent)"
                  : isFound
                    ? "var(--accent-soft)"
                    : isHiddenNeighbor
                      ? "#272d31"
                      : "#171d21";
                const opacity = isActive || isFound || isHiddenNeighbor ? 1 : 0.9;
                const stroke = isActive || isFound || isHiddenNeighbor
                  ? "rgba(242, 245, 238, 0.82)"
                  : "rgba(235, 241, 234, 0.3)";
                const strokeWidth = isActive ? 1.38 : isFound ? 1.08 : isHiddenNeighbor ? 0.96 : 0.7;

                return (
                  <Geography
                    key={iso3}
                    geography={geography}
                    data-testid={`country-${iso3}`}
                    style={{
                      default: {
                        fill,
                        opacity,
                        stroke,
                        strokeWidth,
                        outline: "none",
                        transition:
                          "fill 420ms ease, opacity 420ms ease, stroke-width 420ms ease, stroke 420ms ease",
                      },
                      hover: {
                        fill,
                        opacity,
                        stroke,
                        outline: "none",
                      },
                      pressed: {
                        fill,
                        opacity,
                        stroke,
                        outline: "none",
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>

          <AnimatePresence>
            {celebration &&
              foundNeighbors.map((neighborIso) => {
                const neighbor = countriesByIso[neighborIso];
                return (
                  <motion.g
                    key={`${activeCountryIso}-${neighborIso}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.45 }}
                  >
                    <Line
                      from={activeCountry.centroid}
                      to={neighbor.centroid}
                      stroke="rgba(237, 243, 236, 0.9)"
                      strokeWidth={1}
                      strokeLinecap="round"
                    />
                  </motion.g>
                );
              })}
          </AnimatePresence>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
