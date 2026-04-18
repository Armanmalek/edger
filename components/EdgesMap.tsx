"use client";

import type { Feature } from "geojson";
import { ComposableMap, Geographies, Geography, Line, ZoomableGroup } from "react-simple-maps";
import { countriesByIso } from "@/lib/data";

interface EdgesMapProps {
  activeCountryIso: string;
  foundNeighbors: string[];
  celebration: boolean;
}

function getViewport(activeCountryIso: string) {
  const country = countriesByIso[activeCountryIso];

  return {
    center: country.centroid,
    zoom: 3.6,
  };
}

export function EdgesMap({
  activeCountryIso,
  foundNeighbors,
  celebration,
}: EdgesMapProps) {
  const activeCountry = countriesByIso[activeCountryIso];
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
        <ZoomableGroup center={center} zoom={zoom} disablePanning disableZooming>
          <Geographies geography="/data/world-193.geo.json">
            {({ geographies }: { geographies: Feature[] }) =>
              <>
                {geographies.map((geography) => {
                  const iso3 = String(geography.properties?.iso3 ?? "");

                  return (
                    <Geography
                      key={`base-${iso3}`}
                      geography={geography}
                      data-testid={`country-${iso3}`}
                      style={{
                        default: {
                          fill: "#1d2327",
                          stroke: "none",
                          strokeWidth: 0,
                          vectorEffect: "non-scaling-stroke",
                          outline: "none",
                        },
                        hover: {
                          fill: "#1d2327",
                          stroke: "none",
                          strokeWidth: 0,
                          vectorEffect: "non-scaling-stroke",
                          outline: "none",
                        },
                        pressed: {
                          fill: "#1d2327",
                          stroke: "none",
                          strokeWidth: 0,
                          vectorEffect: "non-scaling-stroke",
                          outline: "none",
                        },
                      }}
                    />
                  );
                })}

                {geographies
                  .filter((geography) => {
                    const iso3 = String(geography.properties?.iso3 ?? "");
                    return iso3 === activeCountryIso || foundNeighbors.includes(iso3);
                  })
                  .map((geography) => {
                    const iso3 = String(geography.properties?.iso3 ?? "");
                    const isActive = iso3 === activeCountryIso;

                    return (
                      <Geography
                        key={`overlay-${iso3}`}
                        geography={geography}
                      style={{
                        default: {
                          fill: isActive ? "#71f28f" : "#314a42",
                          stroke: "none",
                          strokeWidth: 0,
                          vectorEffect: "non-scaling-stroke",
                          outline: "none",
                        },
                        hover: {
                          fill: isActive ? "#71f28f" : "#314a42",
                          stroke: "none",
                          strokeWidth: 0,
                          vectorEffect: "non-scaling-stroke",
                          outline: "none",
                        },
                        pressed: {
                          fill: isActive ? "#71f28f" : "#314a42",
                          stroke: "none",
                          strokeWidth: 0,
                          vectorEffect: "non-scaling-stroke",
                          outline: "none",
                        },
                      }}
                    />
                  );
                })}

                {geographies.map((geography) => {
                  const iso3 = String(geography.properties?.iso3 ?? "");
                  const isActive = iso3 === activeCountryIso;
                  const isFound = foundNeighbors.includes(iso3);
                  const strokeWidth = isActive ? 1.7 : isFound ? 1.15 : 0.92;

                  return (
                    <Geography
                      key={`borders-${iso3}`}
                      geography={geography}
                      style={{
                        default: {
                          fill: "none",
                          stroke: "rgba(238, 244, 236, 0.42)",
                          strokeWidth,
                          vectorEffect: "non-scaling-stroke",
                          outline: "none",
                        },
                        hover: {
                          fill: "none",
                          stroke: "rgba(238, 244, 236, 0.42)",
                          strokeWidth,
                          vectorEffect: "non-scaling-stroke",
                          outline: "none",
                        },
                        pressed: {
                          fill: "none",
                          stroke: "rgba(238, 244, 236, 0.42)",
                          strokeWidth,
                          vectorEffect: "non-scaling-stroke",
                          outline: "none",
                        },
                        }}
                      />
                    );
                  })}
              </>
            }
          </Geographies>

          {celebration &&
            foundNeighbors.map((neighborIso) => {
              const neighbor = countriesByIso[neighborIso];
              return (
                <Line
                  key={`${activeCountryIso}-${neighborIso}`}
                  from={activeCountry.centroid}
                  to={neighbor.centroid}
                  stroke="rgba(237, 243, 236, 0.92)"
                  strokeWidth={1}
                  strokeLinecap="round"
                />
              );
            })}
        </ZoomableGroup>
      </ComposableMap>
    </div>
  );
}
