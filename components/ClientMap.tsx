'use client';

import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import { KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { LayerGroup, Map as LeafletMap } from 'leaflet';
import { CityProfile, ClientRecord } from './client-data';
import { WatermelonButton } from './watermelon-system';

interface ClientMapProps {
  clients: ClientRecord[];
  cityProfile: CityProfile | null;
  selectedId: string | null;
  positioningId: string | null;
  onSelect: (id: string) => void;
  onStartPositioning: (id: string) => void;
  onPositionChange: (id: string, lat: number, lng: number) => void;
  onMarkerPressStart: (id: string) => void;
  onMarkerRelease: (id: string) => void;
  onMarkerAnchorChange: (anchor: { x: number; y: number } | null) => void;
  routePath?: Array<{ lat: number; lng: number }>;
  opportunityZones?: Array<{ id: string; boundary: Array<{ lat: number; lng: number }>; intensity: number; label: string }>;
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

export function ClientMap({
  clients,
  cityProfile,
  selectedId,
  positioningId,
  onSelect,
  onStartPositioning,
  onPositionChange,
  onMarkerPressStart,
  onMarkerRelease,
  onMarkerAnchorChange,
  routePath = [],
  opportunityZones = [],
}: ClientMapProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const googleOverlaysRef = useRef<Array<google.maps.Polygon | google.maps.Polyline | google.maps.Marker>>([]);
  const googleAnchorOverlayRef = useRef<google.maps.OverlayView | null>(null);
  const googlePositionListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const googleCityKeyRef = useRef('');
  const googleSelectedRef = useRef<string | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletLayerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const leafletCityKeyRef = useRef('');
  const leafletSelectedRef = useRef<string | null>(null);
  const leafletAnchorHandlerRef = useRef<(() => void) | null>(null);
  const leafletPositionHandlerRef = useRef<((event: import('leaflet').LeafletMouseEvent) => void) | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef<string | null>(null);
  const releaseHandledRef = useRef<string | null>(null);
  const pressedClientRef = useRef<string | null>(null);
  const [provider, setProvider] = useState<MapProvider>('loading');

  const clearHold = useCallback(() => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
  }, []);

  const beginPress = useCallback((clientId: string, enableLongPress: boolean) => {
    clearHold();
    pressedClientRef.current = clientId;
    holdTriggeredRef.current = null;
    releaseHandledRef.current = null;
    onMarkerPressStart(clientId);
    if (!enableLongPress) return;
    holdTimerRef.current = window.setTimeout(() => {
      holdTriggeredRef.current = clientId;
      navigator.vibrate?.([90, 45, 90]);
      onStartPositioning(clientId);
    }, 5000);
  }, [clearHold, onMarkerPressStart, onStartPositioning]);

  const finishPress = useCallback(() => {
    const clientId = pressedClientRef.current;
    if (!clientId) return;
    clearHold();
    pressedClientRef.current = null;
    releaseHandledRef.current = clientId;
    onMarkerRelease(clientId);
  }, [clearHold, onMarkerRelease]);

  useEffect(() => {
    const finishAfterMapEvents = () => window.setTimeout(finishPress, 0);
    window.addEventListener('pointerup', finishAfterMapEvents);
    window.addEventListener('pointercancel', finishAfterMapEvents);
    return () => {
      window.removeEventListener('pointerup', finishAfterMapEvents);
      window.removeEventListener('pointercancel', finishAfterMapEvents);
    };
  }, [finishPress]);

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
      googleAnchorOverlayRef.current?.setMap(null);
      googleAnchorOverlayRef.current = null;
      googlePositionListenerRef.current?.remove();
      googlePositionListenerRef.current = null;
      clearHold();
      googleMapRef.current = null;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletLayerRef.current = null;
        leafletRef.current = null;
      }
    };
  }, [clearHold]);

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
        strokeColor: '#5a31f4',
        strokeOpacity: 0.72,
        strokeWeight: 2,
        fillColor: '#5a31f4',
        fillOpacity: 0.025,
        zIndex: 1,
      });
      googleOverlaysRef.current.push(boundary);
    }

    opportunityZones.forEach((zone) => {
      const polygon = new google.maps.Polygon({
        map,
        paths: zone.boundary,
        clickable: false,
        strokeColor: '#5b3df5',
        strokeOpacity: Math.min(.82, .32 + zone.intensity * .08),
        strokeWeight: 1,
        fillColor: '#765fff',
        fillOpacity: Math.min(.28, .05 + zone.intensity * .035),
        zIndex: 2,
      });
      googleOverlaysRef.current.push(polygon);
    });

    if (routePath.length >= 2) {
      const route = new google.maps.Polyline({
        map,
        path: routePath,
        clickable: false,
        strokeColor: '#17161b',
        strokeOpacity: .88,
        strokeWeight: 5,
        zIndex: 5,
      });
      googleOverlaysRef.current.push(route);
    }

    const located = clients.filter(
      (client): client is ClientRecord & { lat: number; lng: number } =>
        Number.isFinite(client.lat) && Number.isFinite(client.lng),
    );
    const bounds = new google.maps.LatLngBounds();

    located.forEach((client) => {
      const center = { lat: client.lat, lng: client.lng };
      const isSelected = client.id === selectedId;
      const isPositioning = client.id === positioningId;
      const isGroup = client.mapKind === 'group';
      const isLead = client.mapKind === 'lead';

      const markerSize = isGroup ? (isSelected ? 40 : 34) : isLead ? (isSelected ? 24 : 18) : (isSelected ? 24 : 18);
      const marker = new google.maps.Marker({
        map,
        position: center,
        clickable: true,
        title: isGroup
          ? `${client.name} · ${client.groupCount ?? 0} clientes`
          : `${client.name} · ${client.status}`,
        icon: isLead ? {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: client.markerColor || '#5b3df5',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: isSelected ? 4 : 3,
          scale: isSelected ? 10 : 7,
        } : {
          url: '/brand/aster-client-pin.png',
          scaledSize: new google.maps.Size(markerSize, markerSize),
          anchor: new google.maps.Point(markerSize / 2, markerSize - 3),
          ...(isGroup ? { labelOrigin: new google.maps.Point(markerSize / 2, markerSize * 0.43) } : {}),
        },
        label: isGroup ? {
          text: String(client.groupCount ?? 0),
          color: '#111111',
          fontSize: markerSize >= 40 ? '11px' : '10px',
          fontWeight: '900',
          className: 'aster-group-marker-label',
        } : undefined,
        draggable: isPositioning,
        animation: isPositioning ? google.maps.Animation.BOUNCE : null,
        zIndex: isSelected ? 20 : 10,
      });
      marker.addListener('mousedown', () => beginPress(client.id, !isPositioning));
      marker.addListener('mouseup', finishPress);
      marker.addListener('mouseout', clearHold);
      marker.addListener('dragstart', clearHold);
      marker.addListener('dragend', () => {
        const position = marker.getPosition();
        if (position && isPositioning) onPositionChange(client.id, position.lat(), position.lng());
        finishPress();
      });
      marker.addListener('click', () => {
        if (releaseHandledRef.current === client.id || holdTriggeredRef.current === client.id) {
          releaseHandledRef.current = null;
          holdTriggeredRef.current = null;
          return;
        }
        onSelect(client.id);
      });
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
    googlePositionListenerRef.current?.remove();
    googlePositionListenerRef.current = positioningId
      ? map.addListener('click', (event: google.maps.MapMouseEvent) => {
          const point = event.latLng;
          if (point) onPositionChange(positioningId, point.lat(), point.lng());
        })
      : null;
  }, [beginPress, cityProfile, clearHold, clients, finishPress, onPositionChange, onSelect, opportunityZones, positioningId, provider, routePath, selectedId]);

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

    opportunityZones.forEach((zone) => {
      L.polygon(zone.boundary.map((point) => [point.lat, point.lng]), {
        color: '#5b3df5', weight: 1, opacity: Math.min(.82, .32 + zone.intensity * .08),
        fillColor: '#765fff', fillOpacity: Math.min(.28, .05 + zone.intensity * .035), interactive: false,
      }).addTo(layer);
    });
    if (routePath.length >= 2) {
      L.polyline(routePath.map((point) => [point.lat, point.lng]), { color: '#17161b', weight: 5, opacity: .88, interactive: false }).addTo(layer);
    }
    const located = clients.filter(
      (client): client is ClientRecord & { lat: number; lng: number } =>
        Number.isFinite(client.lat) && Number.isFinite(client.lng),
    );

    located.forEach((client) => {
      const isSelected = client.id === selectedId;
      const isPositioning = client.id === positioningId;
      const isGroup = client.mapKind === 'group';
      const isLead = client.mapKind === 'lead';
      const markerSize = isGroup ? (isSelected ? 40 : 34) : (isSelected ? 24 : 18);
      const marker = L.marker([client.lat, client.lng], {
        icon: isGroup
          ? L.divIcon({
              className: 'aster-group-marker',
              html: `<img src="/brand/aster-client-pin.png" alt=""><span>${client.groupCount ?? 0}</span>`,
              iconSize: [markerSize, markerSize],
              iconAnchor: [markerSize / 2, markerSize - 3],
            })
          : isLead ? L.divIcon({
              className: 'aster-lead-marker',
              html: `<span style="background:${client.markerColor || '#5b3df5'}"></span>`,
              iconSize: [markerSize, markerSize],
              iconAnchor: [markerSize / 2, markerSize / 2],
            }) : L.icon({
              iconUrl: '/brand/aster-client-pin.png',
              iconSize: [markerSize, markerSize],
              iconAnchor: [markerSize / 2, markerSize - 3],
              tooltipAnchor: [0, -markerSize + 8],
            }),
        bubblingMouseEvents: false,
        draggable: isPositioning,
        zIndexOffset: isSelected ? 1000 : 0,
      });
      marker.bindTooltip(isGroup
        ? `${client.name} · ${client.groupCount ?? 0} clientes`
        : `${client.name} · ${client.status}`, {
        direction: 'top',
        offset: [0, -8],
        opacity: 0.96,
      });
      marker.on('mousedown touchstart', () => beginPress(client.id, !isPositioning));
      marker.on('mouseup touchend', finishPress);
      marker.on('mouseout', clearHold);
      marker.on('dragstart', clearHold);
      marker.on('dragend', () => {
        if (!isPositioning) return;
        const point = marker.getLatLng();
        onPositionChange(client.id, point.lat, point.lng);
        finishPress();
      });
      marker.on('click', () => {
        if (releaseHandledRef.current === client.id || holdTriggeredRef.current === client.id) {
          releaseHandledRef.current = null;
          holdTriggeredRef.current = null;
          return;
        }
        onSelect(client.id);
      });
      marker.addTo(layer);
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
    if (leafletPositionHandlerRef.current) map.off('click', leafletPositionHandlerRef.current);
    if (positioningId) {
      const positionHandler = (event: import('leaflet').LeafletMouseEvent) => {
        onPositionChange(positioningId, event.latlng.lat, event.latlng.lng);
      };
      leafletPositionHandlerRef.current = positionHandler;
      map.on('click', positionHandler);
    } else {
      leafletPositionHandlerRef.current = null;
    }
  }, [beginPress, cityProfile, clearHold, clients, finishPress, onPositionChange, onSelect, opportunityZones, positioningId, provider, routePath, selectedId]);

  useEffect(() => {
    const selectedClient = clients.find((client) => client.id === selectedId);
    const hasPosition = selectedClient?.lat !== undefined && selectedClient.lng !== undefined;

    googleAnchorOverlayRef.current?.setMap(null);
    googleAnchorOverlayRef.current = null;
    const googleMap = googleMapRef.current;
    if (provider === 'google' && googleMap && hasPosition) {
      const overlay = new google.maps.OverlayView();
      overlay.onAdd = () => undefined;
      overlay.draw = () => {
        const point = overlay.getProjection()?.fromLatLngToContainerPixel(
          new google.maps.LatLng(selectedClient.lat!, selectedClient.lng!),
        );
        if (point) onMarkerAnchorChange({ x: point.x, y: point.y });
      };
      overlay.onRemove = () => undefined;
      overlay.setMap(googleMap);
      googleAnchorOverlayRef.current = overlay;
      return () => {
        overlay.setMap(null);
        if (googleAnchorOverlayRef.current === overlay) googleAnchorOverlayRef.current = null;
      };
    }

    const leafletMap = leafletMapRef.current;
    if (leafletAnchorHandlerRef.current && leafletMap) {
      leafletMap.off('move zoom resize', leafletAnchorHandlerRef.current);
      leafletAnchorHandlerRef.current = null;
    }
    if (provider === 'demo' && leafletMap && hasPosition) {
      const updateAnchor = () => {
        const point = leafletMap.latLngToContainerPoint([selectedClient.lat!, selectedClient.lng!]);
        onMarkerAnchorChange({ x: point.x, y: point.y });
      };
      leafletAnchorHandlerRef.current = updateAnchor;
      leafletMap.on('move zoom resize', updateAnchor);
      updateAnchor();
      return () => {
        leafletMap.off('move zoom resize', updateAnchor);
        if (leafletAnchorHandlerRef.current === updateAnchor) leafletAnchorHandlerRef.current = null;
      };
    }

    onMarkerAnchorChange(null);
  }, [clients, onMarkerAnchorChange, positioningId, provider, selectedId]);

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
            <WatermelonButton onClick={() => changeZoom(1)} aria-label="Aproximar mapa"><Plus size={17} /></WatermelonButton>
            <WatermelonButton onClick={() => changeZoom(-1)} aria-label="Afastar mapa"><Minus size={17} /></WatermelonButton>
            <WatermelonButton onClick={resetMapView} aria-label="Mostrar cidade inteira"><LocateFixed size={17} /></WatermelonButton>
          </div>
          <div className="map-interaction-hint">Role para zoom · arraste para mover · Ctrl + / −</div>
        </>
      )}
    </div>
  );
}
