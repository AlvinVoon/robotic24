import React, { useState, useEffect } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, Polygon, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { Magnetometer } from "expo-sensors";
import { database } from "./firebase";
import { ref, set } from "firebase/database";
import CustomButton from "./CustomButton";
import { polygon } from "@turf/helpers";
import bbox from "@turf/bbox";
import bboxPolygon from "@turf/bbox-polygon";
import squareGrid from "@turf/square-grid";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

const MapScreen = () => {
  const [location, setLocation] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [squares, setSquares] = useState([]);
  const [compassData, setCompassData] = useState(null);

  useEffect(() => {
    let subscription;
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        console.log("Permission to access location was denied");
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setLocation(location.coords);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000, // Update every 5 seconds
          distanceInterval: 10, // Update every 10 meters
        },
        (newLocation) => {
          setLocation(newLocation.coords);
          uploadLocation(newLocation.coords);
        }
      );
    })();

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  useEffect(() => {
    const magnetometerSubscription = Magnetometer.addListener((data) => {
      setCompassData(data);
      uploadCompassData(data);
    });

    Magnetometer.setUpdateInterval(500); // Update every 500 ms

    return () => {
      magnetometerSubscription && magnetometerSubscription.remove();
    };
  }, []);

  const handleMapPress = (e) => {
    const newMarker = {
      coordinate: e.nativeEvent.coordinate,
      key: Math.random().toString(),
    };
    setMarkers([...markers, newMarker]);
  };

  const deleteMarker = (key) => {
    setMarkers(markers.filter(marker => marker.key !== key));
  };

  const generateSquares = () => {
    if (markers.length > 2) {
      const coordinates = markers.map(marker => [marker.coordinate.longitude, marker.coordinate.latitude]);
      coordinates.push(coordinates[0]); // Close the polygon

      const poly = polygon([coordinates]);
      const bboxCoords = bbox(poly);
      const grid = squareGrid(bboxCoords, 0.01); // 0.01 is the size of each square in degrees

      const squaresInPolygon = grid.features.filter(square => {
        return booleanPointInPolygon(square, poly);
      });

      const squareCoordinates = squaresInPolygon.map(square => {
        return square.geometry.coordinates[0].map(coord => ({ latitude: coord[1], longitude: coord[0] }));
      });

      setSquares(squareCoordinates);
    }
  };

  const uploadMarkers = async () => {
    console.log("Upload Markers button pressed");
    try {
      const markersRef = ref(database, 'markers');
      await set(markersRef, {
        markers: markers.map((marker) => marker.coordinate),
        timestamp: new Date().toISOString(),
      });
      console.log("Markers uploaded successfully!");
      alert("Markers uploaded successfully!");
    } catch (error) {
      console.error("Error uploading markers: ", error);
      alert("Error uploading markers: " + error.message);
    }
  };

  const uploadLocation = async (coords) => {
    try {
      const locationRef = ref(database, 'realtimeLocation');
      await set(locationRef, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        timestamp: new Date().toISOString(),
      });
      console.log("Location uploaded successfully!");
    } catch (error) {
      console.error("Error uploading location: ", error);
    }
  };

  const uploadCompassData = async (data) => {
    try {
      const compassRef = ref(database, 'realtimeCompass');
      await set(compassRef, {
        x: data.x,
        y: data.y,
        z: data.z,
        timestamp: new Date().toISOString(),
      });
      console.log("Compass data uploaded successfully!");
    } catch (error) {
      console.error("Error uploading compass data: ", error);
    }
  };

  useEffect(() => {
    console.log("Markers updated:", markers);
    //generateSquares();
  }, [markers]);

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {location && (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: location.latitude,
              longitude: location.longitude,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            }}
            onPress={handleMapPress}
          >
            {markers.map((marker) => (
              <Marker 
                key={marker.key} 
                coordinate={marker.coordinate}
                onPress={() => {
                  console.log("Marker pressed with key:", marker.key);
                  deleteMarker(marker.key);
                }}
              />
            ))}
            {markers.length > 2 && (
              <Polygon
                coordinates={markers.map(marker => marker.coordinate)}
                fillColor="rgba(0, 200, 0, 0.5)"
                strokeColor="rgba(0,0,0,0.5)"
                strokeWidth={2}
              />
            )}
            {squares.map((square, index) => (
              <Polyline
                key={index}
                coordinates={square}
                strokeColor="rgba(255, 0, 0, 0.5)"
                strokeWidth={1}
              />
            ))}
          </MapView>
        )}
      </View>
      <View style={styles.buttonContainer}>
        <CustomButton title="Upload Markers" onPress={uploadMarkers} />
      </View>
      <View style={styles.compassContainer}>
        {compassData && (
          <Text>Compass Data: X: {compassData.x.toFixed(2)} Y: {compassData.y.toFixed(2)} Z: {compassData.z.toFixed(2)}</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  compassContainer: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});

export default MapScreen;
