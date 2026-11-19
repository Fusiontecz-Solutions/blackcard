import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Mail, Lock, User, MessageCircle } from 'lucide-react';
import { resolveAppLogoSrc } from '@/constants/appLogo';
import { useTheme } from '@/context/ThemeContext';
import { signup } from '../../redux/actions/authActions';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../../redux/store';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const dispatch: AppDispatch = useDispatch();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { loading, error } = useSelector((state: RootState) => state.signup);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters');
      return;
    }

    const result = await dispatch(signup({ email, password, name }));
    console.log(result);
    navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#3b5998] via-[#5b9dd9] to-[#8b7ab8] flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 opacity-30">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 2px, transparent 2px)',
            backgroundSize: '20px 20px'
          }} />
        </div>

        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] opacity-30">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 2px, transparent 2px)',
            backgroundSize: '20px 20px'
          }} />
        </div>

        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-[10%] left-[5%] w-[500px] h-[2px] bg-white/20 rotate-[135deg]" />
          <div className="absolute top-[15%] left-[8%] w-[600px] h-[2px] bg-white/20 rotate-[135deg]" />
          <div className="absolute top-[20%] left-[11%] w-[700px] h-[2px] bg-white/20 rotate-[135deg]" />
          <div className="absolute top-[25%] left-[14%] w-[800px] h-[2px] bg-white/20 rotate-[135deg]" />
          <div className="absolute top-[30%] left-[17%] w-[900px] h-[2px] bg-white/20 rotate-[135deg]" />
        </div>

        <div className="absolute bottom-[5%] left-[10%] w-32 h-32 border-4 border-white/20 rounded-lg" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-block bg-white rounded-full p-4 mb-4">
            <img
              src={resolveAppLogoSrc(isDark)}
              alt="Company logo"
              className="h-16 w-auto max-w-[200px] object-contain"
            />
          </div>
          <h1 className="text-white text-xl font-medium mb-2">Version 2 Syndicator MCA Portal</h1>
          <p className="text-white/80 text-sm">Create your account to get started</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-8">Create Account</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  placeholder="Enter your full name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  placeholder="Enter your email"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  placeholder="Create a password"
                />
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                  placeholder="Confirm your password"
                />
              </div>
            </div>

            {(error || validationError) && (
              <div className="text-red-600 text-sm text-center bg-red-50 py-2 px-4 rounded-lg">
                {validationError || error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-lg font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Sign in here
            </Link>
          </p>
        </div>

        <div className="text-center mt-6">
          <p className="text-white/80 text-sm">Secure • Encrypted • Trusted by 1000+ businesses</p>
        </div>
      </div>

      <button className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full px-6 py-3 flex items-center gap-2 shadow-lg transition-all duration-200 hover:scale-105 z-20">
        <MessageCircle className="h-5 w-5" />
        <span className="font-medium">Talk with Us</span>
      </button>
    </div>
  );
}
