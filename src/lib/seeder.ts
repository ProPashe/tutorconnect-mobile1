import { collection, getDocs, addDoc, doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SUBJECTS_DATA } from '../data/subjects';

export async function seedSubjects() {
  const subjectsRef = collection(db, 'subjects');
  const subjectsSnap = await getDocs(subjectsRef);
  
  if (!subjectsSnap.empty) {
    console.log('Subjects already seeded.');
  } else {
    console.log('Seeding subjects...');
    const flatSubjects: any[] = [];
    Object.entries(SUBJECTS_DATA).forEach(([board, levels]: [string, any]) => {
      Object.entries(levels).forEach(([level, categories]: [string, any]) => {
        Object.entries(categories).forEach(([category, subs]: [string, any]) => {
          subs.forEach((name: string) => {
            flatSubjects.push({ name, level, board, category });
          });
        });
      });
    });

    for (const sub of flatSubjects) {
      const id = `${sub.board}_${sub.level}_${sub.name}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      await setDoc(doc(db, 'subjects', id), sub);
    }
    console.log('Subjects seeded successfully!');
  }

  // Seed Admin Ledgers
  const revenueRef = doc(db, 'admin_ledgers', 'revenue');
  const revenueSnap = await getDoc(revenueRef);
  if (!revenueSnap.exists()) {
    await setDoc(revenueRef, { balance: 0, last_settlement_at: new Date().toISOString() });
  }

  const marketingRef = doc(db, 'admin_ledgers', 'marketing');
  const marketingSnap = await getDoc(marketingRef);
  if (!marketingSnap.exists()) {
    await setDoc(marketingRef, { balance: 1000, last_settlement_at: new Date().toISOString() });
  }
}
