'use client';

import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import { CityProfile, ClientRecord, STATUS_COLORS } from './client-data';

interface ClientMapProps {
  clients: ClientRecord[];
  cityProfile: CityProfile | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

type MapProvider = 'loading' | 'google' | 'demo' | 'google-error';

let googleMapsLibraryPromise: Promise<google.maps.MapsLibrary> | null = null;

function loadGoogleMaps(apiKey: string) {
  if (!googleMapsLibraryPromise) {
    setOptions({
      key: apiKey,
      v: 'weekly',
      language: 'pt-BR',
      region: 'BR',
      authReferrerPolicy: 'origin',
    });
    googleMapsLibraryPromise = importLibrary('maps');
  }
  return googleMapsLibraryPromise;
}

export function ClientMap({ clients, cityProfile, selectedId, onSelect }: ClientMapProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const googleOverlaysRef = useRef<Array<google.maps.Circle | google.maps.Polygon>>([]);
  const googleCityKeyRef = useRef('');
  const googleSelectedRef = useRef<string | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletLayerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const leafletCityKeyRef = useRef('');
  const leafletSelectedRef = useRef<string | null>(null);
  const [provider, setProvider] = useState<MapProvider>('loading');

  useEffect(() => {
    let cancelled = false;

    async function createLeafletDemo() {
      const L = await import('leaflet');
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        touchZoom: true,
        keyboard: true,
      }).setView([-23.3402, -52.7786], 13);

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      leafletLayerRef.current = L.layerGroup().addTo(map);
      leafletRef.current = L;
      leafletMapRef.current = map;
      setProvider('demo');
    }

    async function createMap() {
      if (!containerRef.current || googleMapRef.current || leafletMapRef.current) return;

      let response: Response;
      try {
        response = await fetch('/api/maps-config', { cache: 'no-store' });
      } catch {
        await createLeafletDemo();
        return;
      }

      if (response.status === 503) {
        await createLeafletDemo();
        return;
      }

      if (!response.ok) {
        if (!cancelled) setProvider('google-error');
        return;
      }

      try {
        const config = await response.json() as { apiKey?: string };
        if (!config.apiKey) throw new Error('Chave do mapa ausente.');
        const { Map } = await loadGoogleMaps(config.apiKey);
        if (cancelled || !containerRef.current) return;

        googleMapRef.current = new Map(containerRef.current, {
          center: { lat: -23.3402, lng: -52.7786 },
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          draggable: true,
          scrollwheel: true,
          keyboardShortcuts: true,
          disableDoubleClickZoom: false,
          zoomControl: false,
          styles: [
            { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
          ],
        });
        setProvider('google');
      } catch {
        if (!cancelled) setProvider('google-error');
      }
    }

    void createMap();

    return () => {
      cancelled = true;
      googleOverlaysRef.current.forEach((overlay) => {
        google.maps.event.clearInstanceListeners(overlay);
        overlay.setMap(null);
      });
      googleOverlaysRef.current = [];
      googleMapRef.current = null;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletLayerRef.current = null;
        leafletRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = googleMapRef.current;
    if (provider !== 'google' || !map) return;
    const cityKey = cityProfile ? `${cityProfile.state}-${cityProfile.ibgeId ?? cityProfile.name}` : '';
    const cityChanged = cityKey !== googleCityKeyRef.current;
    googleCityKeyRef.current = cityKey;
    const selectionChanged = selectedId !== googleSelectedRef.current;
    googleSelectedRef.current = selectedId;

    map.setOptions({
      restriction: cityProfile?.bounds
        ? { latLngBounds: cityProfile.bounds, strictBounds: true }
        : null,
    });

    googleOverlaysRef.current.forEach((overlay) => {
      google.maps.event.clearInstanceListeners(overlay);
      overlay.setMap(null);
    });
    googleOverlaysRef.current = [];

    if (cityProfile?.boundary?.length) {
      const boundary = new google.maps.Polygon({
        map,
        paths: cityProfile.boundary,
        clickable: false,
        strokeColor: '#276ef1',
        strokeOpacity: 0.72,
        strokeWeight: 2,
        fillColor: '#276ef1',
        fillOpacity: 0.025,
        zIndex: 1,
      });
      googleOverlaysRef.current.push(boundary);
    }

    const located = clients.filter(
      (client): client is ClientRecord & { lat: number; lng: number } =>
        Number.isFinite(client.lat) && Number.isFinite(client.lng),
    );
    const bounds = new google.maps.LatLngBounds();

    located.forEach((client) => {
      const center = { lat: client.lat, lng: client.lng };
      const color = STATUS_COLORS[client.status];
      const isSelected = client.id === selectedId;

      if (client.locationQuality === 'aproximada') {
        const halo = new google.maps.Circle({
          map,
          center,
          radius: 70,
          clickable: false,
          strokeColor: color,
          strokeOpacity: 0.45,
          strokeWeight: 1,
          fillColor: color,
          fillOpacity: 0.08,
        });
        googleOverlaysRef.current.push(halo);
      }

      const marker = new google.maps.Circle({
        map,
        center,
        radius: isSelected ? 23 : 15,
        clickable: true,
        strokeColor: '#ffffff',
        strokeOpacity: 1,
        strokeWeight: isSelected ? 4 : 3,
        fillColor: color,
        fillOpacity: 1,
        zIndex: isSelected ? 20 : 10,
      });
      marker.addListener('click', () => onSelect(client.id));
      googleOverlaysRef.current.push(marker);
      bounds.extend(center);
    });

    const selectedClient = located.find((client) => client.id === selectedId);
    if (selectionChanged && selectedClient) {
      map.panTo({ lat: selectedClient.lat, lng: selectedClient.lng });
      if ((map.getZoom() ?? 0) < 17) map.setZoom(17);
    } else if (cityChanged && cityProfile?.bounds) {
      map.fitBounds(cityProfile.bounds, 36);
    } else if (cityChanged && cityProfile?.center) {
      map.setCenter(cityProfile.center);
      map.setZoom(13);
    } else if (located.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(17);
    } else if (located.length > 1) {
      map.fitBounds(bounds, 60);
      const listener = map.addListener('idle', () => {
        if ((map.getZoom() ?? 0) > 15) map.setZoom(15);
        listener.remove();
      });
    } else if (cityProfile?.bounds) {
      map.fitBounds(cityProfile.bounds, 36);
    } else if (cityProfile?.center) {
      map.setCenter(cityProfile.center);
      map.setZoom(13);
    }
  }, [cityProfile, clients, onSelect, provider, selectedId]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = leafletMapRef.current;
    const layer = leafletLayerRef.current;
    if (provider !== 'demo' || !L || !map || !layer) return;
    const cityKey = cityProfile ? `${cityProfile.state}-${cityProfile.ibgeId ?? cityProfile.name}` : '';
    const cityChanged = cityKey !== leafletCityKeyRef.current;
    leafletCityKeyRef.current = cityKey;
    const selectionChanged = selectedId !== leafletSelectedRef.current;
    leafletSelectedRef.current = selectedId;

    layer.clearLayers();
    const located = clients.filter(
      (client): client is ClientRecord & { lat: number; lng: number } =>
        Number.isFinite(client.lat) && Number.isFinite(client.lng),
    );

    located.forEach((client) => {
      const color = STATUS_COLORS[client.status];
      const isSelected = client.id === selectedId;
      const marker = L.circleMarker([client.lat, client.lng], {
        radius: isSelected ? 10 : 7,
        color: '#ffffff',
        weight: isSelected ? 4 : 3,
        fillColor: color,
        fillOpacity: 1,
        bubblingMouseEvents: false,
      });
      marker.bindTooltip(`${client.name} · ${client.status}`, {
        direction: 'top',
        offset: [0, -8],
        opacity: 0.96,
      });
      marker.on('click', () => onSelect(client.id));
      marker.addTo(layer);

      if (client.locationQuality === 'aproximada') {
        L.circle([client.lat, client.lng], {
          radius: 70,
          color,
          weight: 1,
          dashArray: '4 4',
          fillColor: color,
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(layer);
      }
    });

    const selectedClient = located.find((client) => client.id === selectedId);
    if (selectionChanged && selectedClient) {
      map.flyTo([selectedClient.lat, selectedClient.lng], Math.max(map.getZoom(), 17), { duration: 0.45 });
    } else if (cityChanged && cityProfile?.bounds) {
      const cityBounds = L.latLngBounds(
        [cityProfile.bounds.south, cityProfile.bounds.west],
        [cityProfile.bounds.north, cityProfile.bounds.east],
      );
      map.setMaxBounds(cityBounds.pad(0.1));
      map.fitBounds(cityBounds, { padding: [36, 36], animate: false });
    } else if (cityChanged && cityProfile?.center) {
      map.setMaxBounds(L.latLngBounds([-90, -180], [90, 180]));
      map.setView([cityProfile.center.lat, cityProfile.center.lng], 13, { animate: false });
    } else if (located.length === 1) {
      map.setView([located[0].lat, located[0].lng], 16, { animate: false });
    } else if (located.length > 1) {
      map.fitBounds(
        L.latLngBounds(located.map((client) => [client.lat, client.lng])),
        { padding: [56, 56], maxZoom: 15, animate: false },
      );
    } else if (cityProfile?.bounds) {
      const cityBounds = L.latLngBounds(
        [cityProfile.bounds.south, cityProfile.bounds.west],
        [cityProfile.bounds.north, cityProfile.bounds.east],
      );
      map.setMaxBounds(cityBounds.pad(0.1));
      map.fitBounds(cityBounds, { padding: [36, 36], animate: false });
    } else if (cityProfile?.center) {
      map.setView([cityProfile.center.lat, cityProfile.center.lng], 13, { animate: false });
    }
  }, [cityProfile, clients, onSelect, provider, selectedId]);

  function changeZoom(delta: number) {
    frameRef.current?.focus({ preventScroll: true });
    const googleMap = googleMapRef.current;
    if (googleMap) {
      const current = googleMap.getZoom() ?? 13;
      googleMap.setZoom(Math.max(3, Math.min(21, current + delta)));
      return;
    }
    const leafletMap = leafletMapRef.current;
    if (leafletMap) leafletMap.setZoom(leafletMap.getZoom() + delta, { animate: true });
  }

  function resetMapView() {
    frameRef.current?.focus({ preventScroll: true });
    const googleMap = googleMapRef.current;
    if (googleMap && cityProfile?.bounds) {
      googleMap.fitBounds(cityProfile.bounds, 36);
      return;
    }
    if (googleMap && cityProfile?.center) {
      googleMap.setCenter(cityProfile.center);
      googleMap.setZoom(13);
      return;
    }
    const leafletMap = leafletMapRef.current;
    if (leafletMap && cityProfile?.bounds) {
      leafletMap.fitBounds([
        [cityProfile.bounds.south, cityProfile.bounds.west],
        [cityProfile.bounds.north, cityProfile.bounds.east],
      ], { padding: [36, 36], animate: true });
    } else if (leafletMap && cityProfile?.center) {
      leafletMap.setView([cityProfile.center.lat, cityProfile.center.lng], 13, { animate: true });
    }
  }

  function handleMapKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    if ((event.ctrlKey || event.metaKey) && ['+', '=', '-', '0'].includes(key)) {
      event.preventDefault();
      if (key === '0') resetMapView();
      else changeZoom(key === '-' ? -1 : 1);
      return;
    }
    if (key === '+' || key === '=') {
      event.preventDefault();
      changeZoom(1);
    } else if (key === '-') {
      event.preventDefault();
      changeZoom(-1);
    }
  }

  return (
    <div
      ref={frameRef}
      className="map-frame"
      tabIndex={0}
      onKeyDown={handleMapKeyDown}
      onPointerDownCapture={() => frameRef.current?.focus({ preventScroll: true })}
      aria-label="Mapa interativo. Use a roda do mouse ou Control mais e menos para zoom; clique e arraste para mover."
    >
      <div ref={containerRef} className="leaflet-map" aria-label="Mapa interativo de clientes" />
      {provider === 'loading' && <div className="map-loading">Preparando mapa…</div>}
      {provider === 'google-error' && (
        <div className="map-loading map-error">
          <strong>O Google Maps não carregou.</strong>
          <span>Confira a chave de navegador, o domínio autorizado e o faturamento do projeto.</span>
        </div>
      )}
      {provider !== 'loading' && provider !== 'google-error' && (
        <div className={`map-provider-chip provider-${provider}`}>
          {provider === 'google'
            ? cityProfile
              ? `Google Maps · ${cityProfile.name}/${cityProfile.state}${cityProfile.bounds ? ' · limites oficiais' : ''}`
              : 'Google Maps · selecione uma cidade'
            : 'Modo demonstração · OpenStreetMap'}
        </div>
      )}
      {provider !== 'loading' && provider !== 'google-error' && (
        <>
          <div className="map-zoom-control" aria-label="Controles do mapa">
            <button onClick={() => changeZoom(1)} aria-label="Aproximar mapa"><Plus size={17} /></button>
            <button onClick={() => changeZoom(-1)} aria-label="Afastar mapa"><Minus size={17} /></button>
            <button onClick={resetMapView} aria-label="Mostrar cidade inteira"><LocateFixed size={17} /></button>
          </div>
          <div className="map-interaction-hint">Role para zoom · arraste para mover · Ctrl + / −</div>
        </>
      )}
    </div>
  );
}
