import { verifyOtp } from "@/redux/actions/authActions";
import type { AppDispatch } from "@/redux/store";
import { Shield } from "lucide-react";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";


const OtpForm = ({ userId, setShowOTPModal, setShowResetPasswordModal }: { userId: string, setShowOTPModal: any, setShowResetPasswordModal: any }) => {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const dispatch: AppDispatch = useDispatch();
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await dispatch(verifyOtp({ userId, otp })).unwrap();
      console.log(res, "res");
      if (res.success) {
        setShowOTPModal(false);
        setShowResetPasswordModal(true);
      }
    } catch (err: any) {
      toast.error(err.message);
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-3xl font-bold text-[#002147] mb-2">Verify OTP</h2>
      <p className="text-sm text-gray-500 dark:text-white mb-10">We have share a code of your registered email address robertfox@gmail.com</p>

      <form onSubmit={handleSubmit} className="space-y-6 w-full">
        <div>
          <label htmlFor="otp" className="block text-sm font-medium text-gray-700 dark:text-white mb-2">OTP</label>
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Shield className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="otp"
              type="text"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="block w-full pl-10 pr-4 py-3 rounded-full dark:text-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
              placeholder="Enter OTP"
            />
          </div>
        </div>

        {error && (
          <div className="text-red-600 dark:text-white text-sm text-center bg-red-50 py-2 px-4 rounded-full">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full cursor-pointer justify-center py-3 px-4 rounded-full text-sm font-semibold text-white bg-[image:var(--brand-gradient)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#002147] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {loading ? 'Verifying...' : 'Verify OTP'}
        </button>
      </form>
    </div>
  )
}

export default OtpForm;