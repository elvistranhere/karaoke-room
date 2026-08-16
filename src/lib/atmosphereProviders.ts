import type { AtmosphereProvider, AtmosphereProviderId } from "./atmosphere";
import { DEFAULT_ATMOSPHERE_PROVIDER } from "./atmosphere";
import { autoProvider } from "./atmosphereAuto";

export const ATMOSPHERE_PROVIDERS: Record<AtmosphereProviderId, AtmosphereProvider> = {
  auto: autoProvider,
};

export function getAtmosphereProvider(id: AtmosphereProviderId): AtmosphereProvider {
  return ATMOSPHERE_PROVIDERS[id] ?? ATMOSPHERE_PROVIDERS[DEFAULT_ATMOSPHERE_PROVIDER];
}
