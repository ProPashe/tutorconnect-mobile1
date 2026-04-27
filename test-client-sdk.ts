
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

async function test() {
  try {
    console.log("Testing Client SDK on server...");
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    
    const cols = await getDocs(collection(db, 'subjects'));
    console.log("Subjects count:", cols.size);
    console.log("Bootstrap test successful.");
  } catch (err: any) {
    console.error("Client SDK error:", err.message);
  }
}

test();
