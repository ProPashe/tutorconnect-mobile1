
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";

async function test() {
  console.log("Testing with projectId:", firebaseConfig.projectId);
  
  try {
    const app = admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
    
    console.log("Testing (default) database...");
    const dbDefault = getFirestore(app);
    try {
      const cols = await dbDefault.listCollections();
      console.log("(default) collections:", cols.map(c => c.id));
    } catch (e: any) {
      console.error("(default) error:", e.message);
    }
    
    const namedDbId = "ai-studio-c22741cd-40a1-44cd-ab9c-536d26780e5c";
    console.log(`Testing named database: ${namedDbId}...`);
    const dbNamed = getFirestore(app, namedDbId);
    try {
      const cols = await dbNamed.listCollections();
      console.log(`${namedDbId} collections:`, cols.map(c => c.id));
    } catch (e: any) {
      console.error(`${namedDbId} error:`, e.message);
    }
    
  } catch (err: any) {
    console.error("Global error:", err.message);
  }
}

test();
