import React, { useState, useEffect } from "react";
import { StyleSheet, View, Text, Button } from "react-native";
import MapView, { Marker, Polygon } from "react-native-maps";
import * as Location from "expo-location";
import { Magnetometer } from "expo-sensors";
import { database } from "./firebase";
import { ref, set } from "firebase/database";
import CustomButton from "./CustomButton";
import Slider from '@react-native-community/slider';
import { polygon as turfPolygon } from "@turf/helpers";
import bbox from "@turf/bbox";
import squareGrid from "@turf/square-grid";
import booleanIntersects from "@turf/boolean-intersects";
import * as Haptics from 'expo-haptics';
import Checkbox from 'expo-checkbox';

const MapScreen = () => {
  const [location, setLocation] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [squares, setSquares] = useState([]);
  const [compassData, setCompassData] = useState(null);
  const [gridSize, setGridSize] = useState(0.001); // Initial grid size
  const [isChecked, setIsChecked] = useState(false);
  const [tideAreas, setTideAreas] = useState([]); // To store areas with tide information
  const [selectedTide, setSelectedTide] = useState(null); // To store the selected tide type (low or high)

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

  useEffect(() => {
    if (isChecked) {
      uploadMarkers();
    }
  }, [isChecked]);

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

  const generateGrid = () => {
    if (markers.length > 2) {
      const coordinates = markers.map(marker => [marker.coordinate.longitude, marker.coordinate.latitude]);
      coordinates.push(coordinates[0]); // Close the polygon

      const poly = turfPolygon([coordinates]);

      // Generate a bounding box around the polygon
      const boundingBox = bbox(poly);

      // Generate a square grid within the bounding box
      const grid = squareGrid(boundingBox, gridSize, { units: 'degrees' });

      // Filter squares that intersect the polygon
      const squaresInPolygon = grid.features.filter(square => {
        return booleanIntersects(square, poly);
      });

      const squareCoordinates = squaresInPolygon.map(square => {
        return square.geometry.coordinates[0].map(coord => ({ latitude: coord[1], longitude: coord[0] }));
      });

      setSquares(squareCoordinates);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); // Trigger strong and long haptic feedback
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const uploadMarkers = async () => {
    console.log("Upload Markers checkbox checked");
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

  const reloadPage = () => {
    setMarkers([]);
    setSquares([]);
    setLocation(null);
    setTideAreas([]);
    setIsChecked(false);
    // Re-fetch the location
    (async () => {
      let location = await Location.getCurrentPositionAsync({});
      setLocation(location.coords);
    })();
  };

  const handleTideAreaSelection = (tideType) => {
    if (markers.length > 2) {
      const coordinates = markers.map(marker => [marker.coordinate.longitude, marker.coordinate.latitude]);
      coordinates.push(coordinates[0]); // Close the polygon

      const poly = turfPolygon([coordinates]);

      const tideArea = {
        type: tideType,
        polygon: poly,
      };

      setTideAreas([...tideAreas, tideArea]);
      setMarkers([]); // Clear the markers after defining the area
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: location ? location.latitude : 37.78825,
          longitude: location ? location.longitude : -122.4324,
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
          <Polygon
            key={index}
            coordinates={square}
            fillColor="rgba(255, 0, 0, 0.3)"
            strokeColor="rgba(255, 0, 0, 0.5)"
            strokeWidth={1}
          />
        ))}
        {tideAreas.map((area, index) => (
          <Polygon
            key={index}
            coordinates={area.polygon.geometry.coordinates[0].map(coord => ({ latitude: coord[1], longitude: coord[0] }))}
            fillColor={area.type === 'low' ? "rgba(0, 0, 255, 0.3)" : "rgba(255, 165, 0, 0.3)"}
            strokeColor={area.type === 'low' ? "rgba(0, 0, 255, 0.5)" : "rgba(255, 165, 0, 0.5)"}
            strokeWidth={2}
          />
        ))}
      </MapView>
      <View style={styles.topContainer}>
        <Button title="Reload" onPress={reloadPage} />
      </View>
      <View style={styles.controlsContainer}>
        <View style={styles.sliderContainer}>
          <Slider
            style={{ width: 300, height: 40 }}
            minimumValue={0.0001}
            maximumValue={0.01}
            step={0.0001}
            value={gridSize}
            onValueChange={value => setGridSize(value)}
          />
          <Text>Grid Size: {gridSize.toFixed(4)} metres</Text>
        </View>
        <CustomButton title="Generate Grid" onPress={generateGrid} />
        <View style={styles.checkboxContainer}>
          <Checkbox
            style={styles.checkbox}
            value={isChecked}
            onValueChange={setIsChecked}
            color={isChecked ? '#4630EB' : undefined}
          />
          <Text style={styles.checkboxLabel}>Upload Markers</Text>
        </View>
        <View style={styles.tideButtonContainer}>
          <Button title="Mark Low Tide Area" onPress={() => handleTideAreaSelection('low')} />
          <Button title="Mark High Tide Area" onPress={() => handleTideAreaSelection('high')} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  topContainer: {
    position: 'absolute',
    top: 40,
    left: 10,
    right: 10,
    zIndex: 1,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 8,
    padding: 10,
  },
  sliderContainer: {
    marginBottom: 10,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    marginRight: 8,
  },
  checkboxLabel: {
    fontSize: 16,
  },
  tideButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
});

export default MapScreen;
