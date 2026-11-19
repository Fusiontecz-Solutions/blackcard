import { resetPassword } from "@/redux/actions/authActions";
import type { AppDispatch } from "@/redux/store";
import { Lock, Eye, EyeOff } from "lucide-react"
import { useEffect, useState } from "react"
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import { toast } from "react-toastify";
import { getPasswordRequirementStatus, validateStandardPassword } from "@/lib/passwordValidation";

const ResetPassword = ({ userId, setShowResetPasswordModal }: { userId: string, setShowResetPasswordModal: (value: boolean) => void }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const dispatch: AppDispatch = useDispatch();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const validationError = validateStandardPassword(password);
        if (validationError) {
            setError(validationError);
            return;
        }
        if (confirmPassword !== password) {
            setError('Passwords do not match');
            return;
        }
        setLoading(true);

        try {
            const res = await dispatch(resetPassword({ userId, password })).unwrap();
            if (res.success) {
                setShowResetPasswordModal(false);
                toast.success(res.message);
                navigate('/login', { replace: true });
            }
        } catch (err: any) {
            toast.error(err.message);
            setError(err.message || 'Failed to send reset email');
        } finally {
            setLoading(false);
        };
    }

    useEffect(() => {
        if (!confirmPassword) {
            setError('');
        } else if (confirmPassword !== password) {
            setError('Passwords do not match');
        } else {
            setError('');
        }
    }, [confirmPassword, password]);

    const passwordStatus = getPasswordRequirementStatus(password);
    const isPasswordStrong = Object.values(passwordStatus).every(Boolean);

    return (
        <div className="w-full">
            <h2 className="text-3xl font-bold text-[#002147] mb-2">Get Started Now</h2>
            <p className="text-sm text-gray-500 mb-10">Enter your credentials to access your account</p>
            <form onSubmit={handleSubmit} className="space-y-6 w-full">
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
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="block w-full pl-10 pr-12 py-3 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                            placeholder="••••••••"
                            autoComplete="new-password"
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
                    <div className="mt-2 space-y-1 text-xs">
                        <p className={passwordStatus.minLength ? "text-green-600" : "text-red-600"}>
                            - Minimum 8 characters
                        </p>
                        <p className={passwordStatus.hasUppercase ? "text-green-600" : "text-red-600"}>
                            - At least 1 uppercase letter
                        </p>
                        <p className={passwordStatus.hasLowercase ? "text-green-600" : "text-red-600"}>
                            - At least 1 lowercase letter
                        </p>
                        <p className={passwordStatus.hasNumber ? "text-green-600" : "text-red-600"}>
                            - At least 1 number
                        </p>
                        <p className={passwordStatus.hasSpecial ? "text-green-600" : "text-red-600"}>
                            - At least 1 special character
                        </p>
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
                            type={showConfirmPassword ? 'text' : 'password'}
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="block w-full pl-10 pr-12 py-3 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
                            placeholder="••••••••"
                            autoComplete="new-password"
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-full"
                            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        >
                            {showConfirmPassword ? (
                                <EyeOff className="h-5 w-5 cursor-pointer" aria-hidden />
                            ) : (
                                <Eye className="h-5 w-5 cursor-pointer" aria-hidden />
                            )}
                        </button>
                    </div>
                    <div className="mt-2 min-h-[22px]">
                        {error && (
                            <p className="text-red-600 text-sm">
                                {error}
                            </p>
                        )}
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading || password !== confirmPassword || !isPasswordStrong}
                    className="w-full justify-center py-3 px-4 rounded-full text-sm font-semibold text-white bg-[image:var(--brand-gradient)] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#002147] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {loading ? 'Submitting...' : 'Reset Password'}
                </button>
            </form>
        </div>
    )
}

export default ResetPassword