import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router';

/** Only in-app paths (open-redirect safe). */
function safeAppReturnPath(raw: string | null): string | null {
  if (raw == null || raw === '') return null;
  try {
    const path = decodeURIComponent(raw);
    if (!path.startsWith('/') || path.startsWith('//')) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null;
    return path;
  } catch {
    return null;
  }
}
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import type { AppDispatch, RootState } from '../../redux/store';
import { login } from '../../redux/actions/authActions';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';

import LoginImg from "../../assets/imageLogin.webp"
import { resolveAppLogoSrc } from '@/constants/appLogo';
import { normalizeRoleKey } from '@/lib/sessionRole';
import { useTheme } from '@/context/ThemeContext';
import { syndicatorMustNotAccessPath } from '@/lib/syndicatorAdminRoutes';

export default function LoginPage() {

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const rememberMe = false;

  const dispatch: AppDispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { loading, error } = useSelector((state: RootState) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await dispatch(login({ email, password, rememberMe })).unwrap();
      if (result.success) {
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        localStorage.setItem('role', result.user.role);
        toast.success(result?.message);

        const afterLogin = safeAppReturnPath(searchParams.get('returnUrl'));
        const roleKey = normalizeRoleKey(result.user.role ?? '');
        const blockedReturn =
          roleKey === 'SYNDICATOR' &&
          afterLogin != null &&
          syndicatorMustNotAccessPath(afterLogin.split('?')[0] ?? '');
        if (afterLogin && !blockedReturn) {
          navigate(afterLogin, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      } else {
        toast.error(result?.message);
      }
    } catch {
      // Rejected login (e.g. invalid password) is already handled in redux error state.
      // Swallow to prevent unhandled promise rejection from bubbling in the UI.
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="w-full h-[calc(100vh-4rem)] grid grid-cols-1 lg:grid-cols-2 bg-white dark:bg-background ">
        {/* Left: Form */}
        <div className="p-2 md:p-8 lg:p-12">
          <div >
            <div className="flex items-center gap-3">
              <img
                src={resolveAppLogoSrc(isDark)}
                alt="Company logo"
                className="h-36 w-36 rounded-lg object-contain"
              />

            </div>
          </div>

          <div className='flex flex-col items-start w-full sm:w-[70%] mx-auto mt-11'>
            <h1 className="text-3xl font-bold text-[#002147] mb-2">Get Started Now</h1>
            <p className="text-sm text-gray-500 dark:text-white mb-10">Enter your credentials to access your account</p>

            <form onSubmit={handleSubmit} className="space-y-6 w-full">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Email Address</label>
                <div className="relative w-full">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
                    placeholder="robertfox@example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-white mb-2">Password</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-12 py-3 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5 cursor-pointer" aria-hidden />
                    ) : (
                      <Eye className="h-5 w-5 cursor-pointer" aria-hidden />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                {/* <label htmlFor="remember-me" className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  Remember Me
                </label> */}

                <Link to="/forgot-password" className="text-sm font-medium text-[#002147] hover:text-[#001530]">
                  Forgot Password?
                </Link>
              </div>

              {error && (
                <div className="text-red-600 text-sm text-center bg-red-50 py-2 px-4 rounded-full">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer justify-center py-3 px-4 rounded-full text-sm font-semibold text-white bg-[image:var(--brand-gradient)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#002147] disabled:opacity-50 disabled:cursor-not-allowed  transition-all"
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>

            {/* <p className="mt-6 text-sm text-gray-600">
              Don't have an account? <Link to="/signup" className="font-semibold text-indigo-700 hover:text-indigo-600">Sign Up</Link>
            </p> */}
          </div>
        </div>

        {/* Right: Illustration panel */}
        <div className="relative hidden lg:block">
          <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-[#002147] via-[#0a3a6b] to-[#e8eef5]" />
          <div className="relative h-full px-10 pb-10 pt-0 text-white flex flex-col items-start justify-around">
            <div className="max-w-md ml-10">
              <h2 className="text-3xl font-semibold leading-snug">The simplest way to manage your workforce</h2>
              <p className="mt-3 text-white/80 dark:text-white">Enter your credentials to access your account</p>
            </div>

            <div>
              <img
                src={LoginImg}
                alt="LoginImg"
                className="w-full h-full  object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
