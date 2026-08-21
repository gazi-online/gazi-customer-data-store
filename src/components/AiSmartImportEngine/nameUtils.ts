export interface NameSuggestion {
  first_name: string;
  middle_name: string;
  last_name: string;
  isReliable: boolean;
  explanation: string;
}

export function suggestNameComponentsFromFullName(fullName?: string | null): NameSuggestion | null {
  if (!fullName || typeof fullName !== 'string') return null;
  const trimmed = fullName.trim();
  if (!trimmed) return null;

  // Split by whitespace
  const parts = trimmed.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return {
      first_name: parts[0],
      middle_name: '',
      last_name: '',
      isReliable: false,
      explanation: 'Unable to reliably suggest separate name components for single-word name.'
    };
  }

  if (parts.length === 2) {
    return {
      first_name: parts[0],
      middle_name: '',
      last_name: parts[1],
      isReliable: true,
      explanation: 'Suggested from Full Name — please verify'
    };
  }

  // 3 or more tokens (e.g., "Mohammad Islam Gazi")
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const middleName = parts.slice(1, parts.length - 1).join(' ');

  return {
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    isReliable: true,
    explanation: 'Suggested from Full Name — please verify'
  };
}
