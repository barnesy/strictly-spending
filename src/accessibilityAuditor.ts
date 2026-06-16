export interface AccessibilityHeading {
  level: number;
  text: string;
  valid: boolean;
}

export interface AccessibilityLandmark {
  tagName: string;
  role: string;
  label: string;
}

export interface AccessibilityInteractiveElement {
  tagName: string;
  text: string;
  role: string;
  label: string;
  accessible: boolean;
  reason?: string;
}

export interface AccessibilityIssue {
  element: string;
  issue: string;
  suggestion: string;
  severity: 'warning' | 'error';
}

export interface AccessibilityReport {
  path: string;
  title: string;
  headings: AccessibilityHeading[];
  landmarks: AccessibilityLandmark[];
  interactiveElements: AccessibilityInteractiveElement[];
  issues: AccessibilityIssue[];
  score: number;
}

export function generateAccessibilityReport(pathname: string): AccessibilityReport {
  const headings: AccessibilityHeading[] = [];
  const landmarks: AccessibilityLandmark[] = [];
  const interactiveElements: AccessibilityInteractiveElement[] = [];
  const issues: AccessibilityIssue[] = [];

  // 1. Analyze Headings
  const headingElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  let lastLevel = 0;
  headingElements.forEach((h) => {
    const level = parseInt(h.tagName.substring(1));
    const text = h.textContent?.trim() || '';
    let valid = true;
    
    // Check for hierarchy skipped levels
    if (lastLevel > 0 && level > lastLevel + 1) {
      valid = false;
      issues.push({
        element: `<${h.tagName.toLowerCase()}> "${text.slice(0, 20)}"`,
        issue: `Heading level skipped from h${lastLevel} to h${level}`,
        suggestion: `Change heading level to h${lastLevel + 1} to maintain correct document hierarchy.`,
        severity: 'warning',
      });
    }
    lastLevel = level;
    headings.push({ level, text, valid });
  });

  // 2. Analyze Landmarks
  const landmarkSelectors = 'header, nav, main, aside, footer, [role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"]';
  const landmarkElements = Array.from(document.querySelectorAll(landmarkSelectors));
  landmarkElements.forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || getImplicitRole(tagName);
    const label = el.getAttribute('aria-label') || '';
    
    landmarks.push({ tagName, role, label });
  });

  // Helper for implicit landmark roles
  function getImplicitRole(tag: string): string {
    if (tag === 'header') return 'banner';
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'aside') return 'complementary';
    if (tag === 'footer') return 'contentinfo';
    return 'region';
  }

  // 3. Analyze Interactive Elements
  const interactiveSelectors = 'button, a[href], input, select, textarea, [role="button"], [tabindex]';
  const elements = Array.from(document.querySelectorAll(interactiveSelectors));

  elements.forEach((el) => {
    const tagName = el.tagName.toLowerCase();
    
    // Skip the Copilot Chat container elements to avoid auditing the chat panel itself
    if (el.closest('.copilot-chat-container')) {
      return;
    }

    const role = el.getAttribute('role') || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const ariaLabelledby = el.getAttribute('aria-labelledby') || '';
    const title = el.getAttribute('title') || '';
    const text = el.textContent?.trim() || '';
    
    let accessible = true;
    let reason = '';

    // Check if it's an input and has a label
    if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
      const id = el.id;
      let hasLabel = false;
      if (id) {
        const labelEl = document.querySelector(`label[for="${id}"]`);
        if (labelEl && labelEl.textContent?.trim()) {
          hasLabel = true;
        }
      }
      // If it's a hidden input or submit button input, ignore
      const inputType = el.getAttribute('type');
      if (inputType === 'hidden' || inputType === 'submit') {
        return;
      }
      
      if (!hasLabel && !ariaLabel && !ariaLabelledby && !title && !el.getAttribute('placeholder')) {
        accessible = false;
        reason = 'Input element is missing an associated label or aria-label attribute';
        issues.push({
          element: `<${tagName} id="${id || ''}" placeholder="${el.getAttribute('placeholder') || ''}">`,
          issue: 'Input field missing label description',
          suggestion: 'Provide an associated <label for="..."> element or add an aria-label attribute to support screen readers.',
          severity: 'error',
        });
      }
    } else {
      // Buttons / Links / Interactive div-spans
      const hasText = text.length > 0;
      const hasAriaName = ariaLabel.length > 0 || ariaLabelledby.length > 0 || title.length > 0;
      
      // Check if it has an SVG icon with aria-label or child elements with label
      let hasChildAriaName = false;
      const svgWithAria = el.querySelector('svg[aria-label]');
      if (svgWithAria) {
        hasChildAriaName = true;
      }

      if (!hasText && !hasAriaName && !hasChildAriaName) {
        accessible = false;
        reason = 'Interactive element has no visible text and no aria-label, aria-labelledby, or title attribute';
        issues.push({
          element: `<${tagName} class="${el.className.split(' ')[0] || ''}">`,
          issue: 'Interactive element missing accessible name',
          suggestion: 'Add text content inside the element or provide an aria-label attribute describing its action.',
          severity: 'error',
        });
      }
    }

    interactiveElements.push({
      tagName,
      text: text.slice(0, 30),
      role: role || getImplicitInteractiveRole(tagName),
      label: ariaLabel || title || '',
      accessible,
      reason: reason || undefined,
    });
  });

  function getImplicitInteractiveRole(tag: string): string {
    if (tag === 'button') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return 'textbox';
    return '';
  }

  // 4. Compute accessibility score
  let score = 100;
  issues.forEach((issue) => {
    if (issue.severity === 'error') {
      score -= 8;
    } else {
      score -= 3;
    }
  });
  score = Math.max(0, score);

  return {
    path: pathname,
    title: document.title,
    headings,
    landmarks,
    interactiveElements,
    issues,
    score,
  };
}
