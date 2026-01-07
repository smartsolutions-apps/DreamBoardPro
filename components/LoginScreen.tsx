import React, { useState } from 'react';
import { Sparkles, Mail, Lock, User, ArrowRight, Loader2, Key } from 'lucide-react';
import { loginWithGoogle, loginWithEmail, registerWithEmail } from '../services/auth';

export const LoginScreen: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
        const user = await loginWithGoogle();
        // If we fell back to a local guest user, reload to trigger App state update
        if (user && user.isAnonymous && user.uid === 'local-guest') {
            window.location.reload();
        }
        // Otherwise, the onAuthStateChanged listener in App.tsx handles the redirect
    } catch (err: any) {
        setError(err.message || "Failed to sign in with Google.");
        setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
        setError("Please fill in all fields.");
        return;
    }
    
    setError(null);
    setIsLoading(true);

    try {
        if (mode === 'login') {
            await loginWithEmail(email, password);
        } else {
            if (!name) {
                setError("Please enter your name.");
                setIsLoading(false);
                return;
            }
            await registerWithEmail(email, password, name);
        }
    } catch (err: any) {
        // Beautify Firebase errors
        let msg = "Authentication failed.";
        if (err.code === 'auth/wrong-password') msg = "Incorrect password.";
        if (err.code === 'auth/user-not-found') msg = "No account found with this email.";
        if (err.code === 'auth/email-already-in-use') msg = "Email already registered.";
        if (err.code === 'auth/weak-password') msg = "Password should be at least 6 characters.";
        setError(msg);
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-indigo-50 flex items-center justify-center p-4">
       <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
          
          {/* Header */}
          <div className="bg-brand-600 p-8 text-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
             <div className="relative z-10 flex flex-col items-center">
                <div className="bg-white text-brand-600 p-3 rounded-2xl shadow-lg mb-4 transform rotate-3">
                   <Sparkles size={32} />
                </div>
                <h1 className="text-3xl font-black text-white tracking-tight">DreamBoard<span className="text-brand-200">Pro</span></h1>
                <p className="text-brand-100 mt-2 font-medium">Where stories come to life.</p>
             </div>
          </div>

          {/* Body */}
          <div className="p-8">
             <button
               onClick={handleGoogleLogin}
               disabled={isLoading}
               className="w-full bg-white border-2 border-gray-100 hover:border-brand-200 hover:bg-gray-50 text-gray-700 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-all transform active:scale-95 shadow-sm"
             >
                {isLoading ? <Loader2 className="animate-spin text-brand-500" size={20} /> : (
                    <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5" />
                )}
                Continue with Google
             </button>

             <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                   <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                   <span className="px-2 bg-white text-gray-400 font-medium">or use email</span>
                </div>
             </div>

             <form onSubmit={handleEmailSubmit} className="space-y-4">
                {mode === 'signup' && (
                    <div className="relative">
                        <User className="absolute left-3 top-3.5 text-gray-400" size={18} />
                        <input 
                           type="text" 
                           placeholder="Your Name"
                           value={name}
                           onChange={e => setName(e.target.value)}
                           className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:bg-white outline-none transition-all font-medium text-gray-700"
                        />
                    </div>
                )}

                <div className="relative">
                    <Mail className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    <input 
                       type="email" 
                       placeholder="Email Address"
                       value={email}
                       onChange={e => setEmail(e.target.value)}
                       className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:bg-white outline-none transition-all font-medium text-gray-700"
                    />
                </div>

                <div className="relative">
                    <Lock className="absolute left-3 top-3.5 text-gray-400" size={18} />
                    <input 
                       type="password" 
                       placeholder="Password"
                       value={password}
                       onChange={e => setPassword(e.target.value)}
                       className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:bg-white outline-none transition-all font-medium text-gray-700"
                    />
                </div>

                {error && (
                    <div className="text-red-500 text-sm font-medium bg-red-50 p-3 rounded-lg flex items-center gap-2">
                        <Key size={14} /> {error}
                    </div>
                )}

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all active:scale-95"
                >
                   {isLoading ? <Loader2 className="animate-spin" /> : <ArrowRight size={20} />}
                   {mode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
             </form>

             <div className="mt-6 text-center">
                <p className="text-gray-500 text-sm">
                   {mode === 'login' ? "Don't have an account?" : "Already have an account?"}{' '}
                   <button 
                     onClick={() => {
                        setMode(mode === 'login' ? 'signup' : 'login');
                        setError(null);
                     }}
                     className="text-brand-600 font-bold hover:underline"
                   >
                      {mode === 'login' ? 'Sign Up' : 'Log In'}
                   </button>
                </p>
             </div>
          </div>
       </div>
    </div>
  );
};