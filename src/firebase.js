import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyBWidCFr5t25H0IZEa6v22Jetwh61ulxV4",
    authDomain: "togachat-1b4ba.firebaseapp.com",
    projectId: "togachat-1b4ba",
    storageBucket: "togachat-1b4ba.firebasestorage.app",
    messagingSenderId: "210254894760",
    appId: "1:210254894760:web:46064c930d0ac42856549d",
    measurementId: "G-YWMWKQ8EGV"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const provider = new GoogleAuthProvider();