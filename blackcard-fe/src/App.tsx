import { useEffect, useMemo } from 'react';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { Provider } from 'react-redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { store } from './redux/store';
import { ToastContainer } from 'react-toastify';
import "react-toastify/dist/ReactToastify.css"
import './App.css'
import Routes from './routes';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { TooltipProvider } from './components/ui/tooltip';
import { SocketProvider } from './context/SocketContext';
import { QUERY_STALE_TIME_MS } from '@/lib/queryDefaults';
import { registerApplicationsListQueryInvalidator } from '@/lib/applicationsListQuerySync';
import CrmCacheBootstrap from '@/components/cache/CrmCacheBootstrap';

/** Module-level router so route-table edits apply on full reload (HMR cannot refresh useMemo([])). */
const router = createBrowserRouter(Routes);

// Inner component that can access theme context
function AppContent() {
  const { resolvedTheme } = useTheme();

  return (
    <>
      <RouterProvider router={router} />
      <ToastContainer
        position="top-right"
        autoClose={4000}
        draggable
        theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
        style={{ zIndex: 10050 }}
      />
    </>
  );
}

function App() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: QUERY_STALE_TIME_MS,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
    [],
  );

  useEffect(() => {
    registerApplicationsListQueryInvalidator(() => {
      void queryClient.invalidateQueries({
        queryKey: ["applications-list"],
        refetchType: "active",
      });
    });
    return () => registerApplicationsListQueryInvalidator(null);
  }, [queryClient]);

  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SocketProvider>
            <CrmCacheBootstrap />
            <TooltipProvider>
              <AppContent />
            </TooltipProvider>
          </SocketProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </Provider>
  )
}

export default App
