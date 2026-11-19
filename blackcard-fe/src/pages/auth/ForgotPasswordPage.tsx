import { useState } from 'react';
import { Link } from 'react-router';

import { ArrowLeft, Mail } from 'lucide-react';
import OtpForm from './OtpForm';
import ResetPassword from './ResetPassword';
import { useDispatch } from 'react-redux';
import { forgotPassword } from '@/redux/actions/authActions';
import type { AppDispatch } from '@/redux/store';
import LoginImg from "../../assets/imageLogin.webp"
import { resolveAppLogoSrc } from '@/constants/appLogo';
import { useTheme } from '@/context/ThemeContext';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);

  const dispatch: AppDispatch = useDispatch();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await dispatch(forgotPassword(email)).unwrap();
      if (res.success) {
        setShowOTPModal(true);
        setUserId(res.userId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center p-6">
      <div className="w-full h-[calc(100vh-4rem)] grid grid-cols-1 lg:grid-cols-2 bg-white dark:bg-background ">
        {/* Left: Form */}
        <div className="p-2 md:p-8 lg:p-12">
          <div>
            <div className="flex items-center gap-3">
              <img
                src={resolveAppLogoSrc(isDark)}
                alt="Company logo"
                className="h-36 w-36 rounded-lg object-contain"
              />

            </div>
          </div>
            

          {/* Content area */}
          <div className='flex flex-col items-start w-full sm:w-[70%] mx-auto mt-22'>
            {showResetPasswordModal ? (
              <ResetPassword userId={userId} setShowResetPasswordModal={setShowResetPasswordModal} />
            ) : showOTPModal ? (
              <OtpForm userId={userId} setShowOTPModal={setShowOTPModal} setShowResetPasswordModal={setShowResetPasswordModal} />
            ) : (
              <>
                <Link
                  to="/login"
                  className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Login
                </Link>
                <h1 className="text-3xl font-bold text-[#002147] mb-2">Forgot Password</h1>
                <p className="text-sm text-gray-500 dark:text-white mb-10">Enter your registered email address. We'll send you a code to reset your password.</p>

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
                        placeholder="Robertfox@example.com"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="text-red-600 text-sm text-center bg-red-50 py-2 px-4 rounded-full">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || !email}
                    className="w-full cursor-pointer justify-center py-3 px-4 rounded-full text-sm font-semibold text-white bg-[image:var(--brand-gradient)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#002147] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isLoading ? 'Sending...' : 'Send OTP'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Right: Illustration panel */}
        <div className="relative hidden lg:block">
          <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-[#002147] via-[#0a3a6b] to-[#e8eef5]" />
          <div className="relative h-full p-10 text-white flex flex-col items-start justify-around">
            <div className="max-w-md ml-10">
              <h2 className="text-3xl font-semibold leading-snug">The simplest way to manage your workforce</h2>
              <p className="mt-3 text-white/80 dark:text-white">Enter your credentials to access your account</p>
            </div>

            <div>
              <img
                src={LoginImg}
                alt="loginLogo"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
