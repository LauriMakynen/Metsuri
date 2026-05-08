// This is just to extract the correct handleMeasurementClick function
const handleMeasurementClick = useCallback((e: L.LeafletMouseEvent) => {
  if (!mapRef.current || !measurementLayerRef.current) return;

  const latlng = e.latlng;
  setMeasurementPoints((prevPoints) => {
    const newPoints = [...prevPoints, [latlng.lat, latlng.lng] as [number, number]];

    // Add marker
    L.circleMarker([latlng.lat, latlng.lng], {
      radius: 6,
      fillColor: '#ef4444',
      color: '#fff',
      weight: 2,
      fillOpacity: 0.8,
    }).addTo(measurementLayerRef.current!);

    // If we have 2 points, draw line and calculate distance
    if (newPoints.length === 2) {
      const dist = calculateDistance(newPoints[0][0], newPoints[0][1], newPoints[1][0], newPoints[1][1]);
      setMeasurementDistance(dist);

      // Draw line between points
      L.polyline(newPoints, {
        color: '#ef4444',
        weight: 2,
        opacity: 0.7,
      }).addTo(measurementLayerRef.current!);

      // Add distance label at midpoint
      const midLat = (newPoints[0][0] + newPoints[1][0]) / 2;
      const midLng = (newPoints[0][1] + newPoints[1][1]) / 2;
      const label = formatDistance(dist);
      L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'measurement-label',
          html: `<div style="background:#ef4444;color:white;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:bold;white-space:nowrap;">${label}</div>`,
          iconSize: [0, 0],
        }),
      }).addTo(measurementLayerRef.current!);
    }

    return newPoints;
  });
}, []);
