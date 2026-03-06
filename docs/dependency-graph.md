# Generation Dependency Graph

## Current (Implemented)

```text
normalizeConfig
  -> createContext
    -> runGridStage
      -> runHeightmapStage
        -> runFeatureStage
          -> runPackStage
            -> runPackFeatureStage
            -> runLandmassStage
              -> runWaterbodyStage
                -> runGridFeatureMarkupStage
                  -> runClimateStage
                    -> runHydrologyStage
                      -> runBiomeStage
                        -> runCulturesStage (optional)
                          -> runSettlementsStage (optional)
                            -> runStatesStage (optional)
                              -> runRoutesStage (optional)
                                -> runProvincesStage (optional)
                                  -> runReligionsStage (optional)
                                    -> runMilitaryStage (optional)
                                      -> runMarkersZonesStage (optional)
                                        -> toWorldGraph
```

## UI Migration Boundary (Next)

```text
fmg-lib (headless generation + schema)
  -> ui/adapter (read-only world projection)
    -> ui/renderer (draw passes)
      -> ui/app (controls + camera + persistence)
```

## Rules

- A stage can read previous stage outputs only.
- No stage may read DOM/global state.
- Stage outputs must be deterministic for fixed seed/config.
