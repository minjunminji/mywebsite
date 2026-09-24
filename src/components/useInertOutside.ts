'use client';

import { useEffect, type RefObject } from 'react';

/**
 * While `active`, makes everything outside `ref`'s element inert, so Tab can't
 * leave a full-screen takeover for controls hidden behind it (the story, the
 * piano player). Walks from the element up to <body>, marking each ancestor's
 * other children inert, and restores exactly those on deactivate. Elements that
 * were already inert are left alone.
 */
export function useInertOutside(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return undefined;

    const marked: Element[] = [];
    let node: HTMLElement = el;
    while (node.parentElement && node !== document.body) {
      const parent: HTMLElement = node.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node || sibling.hasAttribute('inert')) continue;
        sibling.setAttribute('inert', '');
        marked.push(sibling);
      }
      node = parent;
    }

    return () => {
      for (const sibling of marked) sibling.removeAttribute('inert');
    };
  }, [ref, active]);
}
