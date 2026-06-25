'use client';

import { createContext, useContext } from 'react';

const InvoiceFileConvertTrialModeContext = createContext(false);

export function InvoiceFileConvertTrialModeProvider({
  children,
  trialMode,
}: {
  children: React.ReactNode;
  trialMode: boolean;
}) {
  return (
    <InvoiceFileConvertTrialModeContext.Provider value={trialMode}>
      {children}
    </InvoiceFileConvertTrialModeContext.Provider>
  );
}

export function useInvoiceFileConvertTrialMode() {
  return useContext(InvoiceFileConvertTrialModeContext);
}
