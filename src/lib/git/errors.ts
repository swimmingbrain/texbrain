// isomorphic-git throws precise but unfriendly errors. this turns them into
// something a person can act on: what went wrong and what to do about it

export type TroubleKind = 'auth' | 'notfound' | 'network' | 'conflict' | 'checkout' | 'rejected' | 'author' | 'other';

export interface GitTrouble {
  kind: TroubleKind;
  title: string;
  hint: string;
  files: string[];
}

export function describeGitError(err: any, action: string): GitTrouble {
  const code: string = err?.code || '';
  const status: number | undefined = err?.data?.statusCode;
  const message: string = err?.message || String(err);
  const files: string[] = Array.isArray(err?.data?.filepaths) ? err.data.filepaths : [];

  if (code === 'UserCanceledError' || status === 401 || status === 403) {
    return {
      kind: 'auth',
      title: 'The remote wants a login',
      hint: 'Add a personal access token in the git settings. Private repositories and pushing always need one.',
      files
    };
  }

  if (status === 404) {
    return {
      kind: 'notfound',
      title: 'The remote said: not found',
      hint: 'Check the address. Private repositories also answer with not found until you add a token.',
      files
    };
  }

  if (code === 'MergeConflictError') {
    return {
      kind: 'conflict',
      title: 'Both sides changed the same lines',
      hint: 'Nothing was touched. Commit your work, then resolve it in a terminal, or discard your version of the files listed here and try again.',
      files
    };
  }

  if (code === 'CheckoutConflictError') {
    return {
      kind: 'checkout',
      title: 'Some files have changes that would be lost',
      hint: 'Commit or discard them first, then switch again.',
      files
    };
  }

  if (code === 'PushRejectedError') {
    return {
      kind: 'rejected',
      title: 'The remote has commits you don\'t have yet',
      hint: 'Pull first, then push again.',
      files
    };
  }

  if (code === 'MissingNameError' || code === 'MissingAuthorError') {
    return {
      kind: 'author',
      title: 'Git needs to know who you are',
      hint: 'Fill in your name and email in the git settings.',
      files
    };
  }

  if (code === 'UnknownTransportError' || code === 'SmartHttpError' || /Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return {
      kind: 'network',
      title: 'Could not reach the remote',
      hint: 'Check your connection and the address. Browsers can only talk to git through a proxy, the one in the settings may be down.',
      files
    };
  }

  return {
    kind: 'other',
    title: `${action} failed`,
    hint: message,
    files
  };
}

// one line for toasts
export function troubleText(t: GitTrouble): string {
  const list = t.files.length > 0 ? ` (${t.files.slice(0, 3).join(', ')}${t.files.length > 3 ? ', ...' : ''})` : '';
  return `${t.title}${list}. ${t.hint}`;
}
