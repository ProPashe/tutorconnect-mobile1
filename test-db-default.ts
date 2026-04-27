
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function test() {
  try {
    const app = admin.initializeApp();
    const options = app.options;
    console.log("Default Project ID:", (app as any).options_.projectId || "unknown");
    
    const db = getFirestore(app);
    try {
      const cols = await db.listCollections();
      console.log("Collections:", cols.map(c => c.id));
    } catch (e: any) {
      console.error("Error:", e.message);
    }
  } catch (err: any) {
    console.error("Global error:", err.message);
  }
}

test();
