"use client";

import { memo } from "react";
import type { Feature } from "geojson";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { countriesByIso } from "@/lib/data";
import styles from "./edges-map.module.css";

interface EdgesMapProps {
  activeCountryIso: string;
  correctNeighbors: string[];
  completeNeighbors: string[];
  celebratingIso: string | null;
}

const BASE_FILL = "#23292d";
const ACTIVE_FILL = "#7ef39e";
const CORRECT_FILL = "#6d9186";
const COMPLETE_FILL = "#7ef3c8";
const BASE_BORDER = "rgba(245, 248, 241, 0.56)";
const HIGHLIGHT_BORDER = "rgba(245, 248, 241, 0.78)";
const ACTIVE_BORDER = "rgba(251, 255, 250, 0.84)";

function getFillStyle(fill: string) {
  return {
    default: {
      outline: "none",
    },
    hover: {
      outline: "none",
    },
    pressed: {
      outline: "none",
    },
  };
}

function getBorderStyle(stroke: string, strokeWidth: number) {
  return {
    default: {
      outline: "none",
    },
    hover: {
      outline: "none",
    },
    pressed: {
      outline: "none",
    },
  };
}

function getViewport(activeCountryIso: string) {
  const country = countriesByIso[activeCountryIso];

  return {
    center: country.centroid,
    zoom: 3.6,
  };
}

export const EdgesMap = memo(function EdgesMap({
  activeCountryIso,
  correctNeighbors,
  completeNeighbors,
  celebratingIso,
}: EdgesMapProps) {
  const activeCountry = countriesByIso[activeCountryIso];
  const { center, zoom } = getViewport(activeCountryIso);
  const geographyPath = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/world-193.geo.json`;
  const correctSet = new Set(correctNeighbors);
  const completeSet = new Set(completeNeighbors);

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
          <Geographies geography={geographyPath}>
            {({ geographies }: { geographies: Feature[] }) =>
              <>
                {geographies.map((geography) => {
                  const iso3 = String(geography.properties?.iso3 ?? "");

                  return (
                    <Geography
                      key={`base-${iso3}`}
                      className={styles.countryBase}
                      geography={geography}
                      data-testid={`country-${iso3}`}
                      fill={BASE_FILL}
                      stroke="none"
                      strokeWidth={0}
                      style={getFillStyle(BASE_FILL)}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}

                {geographies
                  .filter((geography) => {
                    const iso3 = String(geography.properties?.iso3 ?? "");
                    return iso3 === activeCountryIso || correctSet.has(iso3) || completeSet.has(iso3);
                  })
                  .map((geography) => {
                    const iso3 = String(geography.properties?.iso3 ?? "");
                    const isActive = iso3 === activeCountryIso;
                    const isComplete = completeSet.has(iso3);
                    const isCelebratingCountry = iso3 === celebratingIso;
                    const fill = isActive
                      ? ACTIVE_FILL
                      : isComplete
                        ? COMPLETE_FILL
                        : CORRECT_FILL;
                    const overlayClassName = [
                      styles.countryOverlay,
                      isCelebratingCountry ? styles.countryLift : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <Geography
                        key={`overlay-${iso3}`}
                        geography={geography}
                        className={overlayClassName}
                        fill={fill}
                        stroke="none"
                        strokeWidth={0}
                        style={getFillStyle(fill)}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}

                {geographies.map((geography) => {
                  const iso3 = String(geography.properties?.iso3 ?? "");
                  const isActive = iso3 === activeCountryIso;
                  const isHighlighted = correctSet.has(iso3) || completeSet.has(iso3);
                  const isCelebratingCountry = iso3 === celebratingIso;
                  const stroke = isActive
                    ? ACTIVE_BORDER
                    : isHighlighted
                      ? HIGHLIGHT_BORDER
                      : BASE_BORDER;
                  const strokeWidth = isActive ? 1.72 : isHighlighted ? 1.24 : 0.96;
                  const borderClassName = [
                    styles.countryBorder,
                    isCelebratingCountry ? styles.countryBorderLift : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <Geography
                      key={`borders-${iso3}`}
                      geography={geography}
                      className={borderClassName}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      style={getBorderStyle(stroke, strokeWidth)}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
              </>
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
});
