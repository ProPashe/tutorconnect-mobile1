import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import toast from 'react-hot-toast';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  tutorProfile: any | null;
  activeRole: 'student' | 'tutor' | 'admin' | 'super-admin' | null;
  loading: boolean;
  signInWithGoogle: (role: 'student' | 'tutor') => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setActiveRole: (role: 'student' | 'tutor' | 'admin' | 'super-admin' | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [tutorProfile, setTutorProfile] = useState<any | null>(null);
  const [activeRole, setActiveRoleState] = useState<'student' | 'tutor' | 'admin' | 'super-admin' | null>(() => {
    return localStorage.getItem('activeRole') as any || null;
  });
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  const setActiveRole = (role: 'student' | 'tutor' | 'admin' | 'super-admin' | null) => {
    setActiveRoleState(role);
    if (role) {
      localStorage.setItem('activeRole', role);
    } else {
      localStorage.removeItem('activeRole');
    }
  };

  const fetchProfile = async (uid: string) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const pData = docSnap.data();
        if (pData.role) pData.role = pData.role.toLowerCase();
        
        // Ensure designated emails are always treated as admins in the profile
        const systemAdmins = ["mudzimwapanashe123@gmail.com", "mudzimwapanashe506@gmail.com"];
        if (user?.email && systemAdmins.includes(user.email)) {
          pData.role = 'admin';
        }

        setProfile(pData);
        if (!activeRole && !localStorage.getItem('activeRole')) {
          setActiveRole(pData.role || 'student');
        }
        
        if (pData.role === 'tutor' || activeRole === 'tutor' || localStorage.getItem('activeRole') === 'tutor') {
          const tRef = doc(db, 'tutor_profiles', uid);
          const tSnap = await getDoc(tRef);
          if (tSnap.exists()) {
            setTutorProfile(tSnap.data());
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${uid}`);
    }
  };

  useEffect(() => {
    if (user && activeRole === 'tutor') {
      const fetchTutor = async () => {
        const tSnap = await getDoc(doc(db, 'tutor_profiles', user.uid));
        if (tSnap.exists()) {
          setTutorProfile(tSnap.data());
        }
      };
      fetchTutor();
    }
  }, [activeRole, user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        setUser(user);
        if (user) {
          await fetchProfile(user.uid);
        } else {
          setProfile(null);
          setTutorProfile(null);
          setActiveRole(null);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.uid);
    }
  };

  const signInWithGoogle = async (role: 'student' | 'tutor') => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        const newProfile = {
          full_name: user.displayName || user.email?.split('@')[0] || 'User',
          email: user.email,
          role: role,
          is_registered: false,
          wallet_balance: 0,
          referral_code: `${role.toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          referral_count: 0,
          created_at: serverTimestamp(),
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
        setActiveRole(role);

        if (role === 'tutor') {
          const newTutorProfile = {
            is_verified: false,
            is_online: false,
            free_bids_remaining: 3,
            verification_status: {
              id: 'missing',
              certificates: 'missing',
              face_match: 'missing',
              payout: 'missing'
            },
            verification_score: 0,
            total_rating_sum: 0,
            total_ratings: 0,
            avg_rating: 0
          };
          await setDoc(doc(db, 'tutor_profiles', user.uid), newTutorProfile);
          setTutorProfile(newTutorProfile);
        }
      } else {
        const pData = docSnap.data();
        const existingRole = pData.role;
        const isAdmin = existingRole?.toLowerCase() === 'admin' || existingRole?.toLowerCase() === 'super-admin';

        if (!isAdmin && existingRole !== role) {
          toast.error(`Access Denied: You are already registered as a ${existingRole}.`);
          setIsSigningIn(false);
          return;
        }

        setProfile(pData);
        setActiveRole(isAdmin ? role : existingRole);
        
        if (pData.role === 'tutor' || (isAdmin && role === 'tutor')) {
          const tSnap = await getDoc(doc(db, 'tutor_profiles', user.uid));
          if (tSnap.exists()) {
            setTutorProfile(tSnap.data());
          }
        }
      }
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked') {
        toast.error('Sign-in popup was blocked by your browser. Please allow popups for this site.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        toast.error('Sign-in cancelled. Please complete the process in the popup.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore this one as it's usually a result of multiple clicks
      } else {
        console.error('Sign-in error:', error);
        toast.error('An error occurred during sign-in. Please try again.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const logout = () => signOut(auth);

  const signInWithEmail = async (email: string, pass: string) => {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    if (result.user) {
      const docSnap = await getDoc(doc(db, 'users', result.user.uid));
      if (docSnap.exists()) {
        const pData = docSnap.data();
        if (pData.role) pData.role = pData.role.toLowerCase();
        setProfile(pData);
        setActiveRole(pData.role);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, tutorProfile, activeRole, loading, signInWithGoogle, signInWithEmail, logout, refreshProfile, setActiveRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
