import {
    auth,
    googleProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    updateProfile,
    signInAsGuest
} from './firebase';

const LS_AUTH_KEY = 'dreamBoard_localGuest';

export const ensureAuthenticated = async (): Promise<string> => {
    if (auth.currentUser) {
        return auth.currentUser.uid;
    }
    try {
        const user = await signInAsGuest();
        if (user) return user.uid;
        throw new Error("Guest login failed");
    } catch (e) {
        console.error("Auth Error", e);
        throw e;
    }
};

export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        localStorage.removeItem(LS_AUTH_KEY); // Clear local fallback if real auth works
        return result.user;
    } catch (error: any) {
        console.error("Google Login Error", error);

        // FIX: Fallback to Guest/Local mode if domain is not authorized (common in previews)
        if (error.code === 'auth/unauthorized-domain' || error.code === 'auth/operation-not-allowed') {
            console.warn("Domain unauthorized. Falling back to Guest Mode.");
            const guestUser = await signInAsGuest();
            return guestUser;
        }

        throw error;
    }
};

export const loginWithEmail = async (email: string, pass: string) => {
    try {
        const result = await signInWithEmailAndPassword(auth, email, pass);
        localStorage.removeItem(LS_AUTH_KEY);
        return result.user;
    } catch (error) {
        console.error("Email Login Error", error);
        throw error;
    }
};

export const registerWithEmail = async (email: string, pass: string, name: string) => {
    try {
        const result = await createUserWithEmailAndPassword(auth, email, pass);
        if (result.user && name) {
            await updateProfile(result.user, { displayName: name });
        }
        localStorage.removeItem(LS_AUTH_KEY);
        return result.user;
    } catch (error) {
        console.error("Registration Error", error);
        throw error;
    }
};

export const logout = async () => {
    try {
        await signOut(auth);
        localStorage.removeItem(LS_AUTH_KEY);
    } catch (error) {
        console.error("Logout Error", error);
        localStorage.removeItem(LS_AUTH_KEY); // Force clear anyway
        throw error;
    }
};