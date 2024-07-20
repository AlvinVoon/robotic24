import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyCgw-kQAn-ThNokye9aihK5FGYVCQ_jnFM",
    authDomain: "robotic2024-ccec0.firebaseapp.com",
    projectId: "robotic2024-ccec0",
    storageBucket: "robotic2024-ccec0.appspot.com",
    messagingSenderId: "715822085022",
    appId: "1:715822085022:web:c1d334033c4dafb5c2dc8f",
    databaseURL: "https://robotic2024-ccec0-default-rtdb.asia-southeast1.firebasedatabase.app/"
  };

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const database = getDatabase(app);

export { database };