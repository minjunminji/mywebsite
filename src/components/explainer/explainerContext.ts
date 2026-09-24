// src/components/explainer/explainerContext.ts
import { createContext, useContext } from 'react';

/** Whether the takeover is open — figures pause while it's closed. */
export const ExplainerOpenContext = createContext(false);
export const useExplainerOpen = () => useContext(ExplainerOpenContext);
