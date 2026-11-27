// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api';
import { EmailCard } from '../src/pages/Email';
import { a11yViolations, fakeApi, renderApp } from './harness';

describe('E-mail card (optional verified e-mail, mock messaging)', () => {
  it('shows the empty state, sends a code, then confirms with the code', async () => {
    let state = { email: null as string | null, email_verified: false, pending: false };
    const a = fakeApi({
      emailState: async () => state,
      emailStart: async (e: string) => { state = { email: e, email_verified: false, pending: true }; return { status: 'code_sent', expires_in: 600 }; },
      emailVerify: async () => { state = { email: state.email, email_verified: true, pending: false }; return { email: state.email, email_verified: true }; },
    });
    const { container } = renderApp(<EmailCard onChange={() => undefined} />, { api: a });
    expect(await screen.findByText('No e-mail address on this account.')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send code' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('E-mail address'), 'Mona@Example.org');
    await userEvent.click(send);
    await waitFor(() => expect(a.emailStart).toHaveBeenCalledWith('Mona@Example.org'));
    expect(await screen.findByText(/We sent a 6-digit code to mona@example.org/)).toBeInTheDocument();
    expect(screen.getByText('Not confirmed yet')).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirm e-mail' });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('E-mail code'), '123456');
    await userEvent.click(confirm);
    await waitFor(() => expect(a.emailVerify).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
    expect(screen.queryByLabelText('E-mail code')).not.toBeInTheDocument();
    expect(await a11yViolations(container)).toEqual([]);
  });

  it('shows the translated reason when the address is taken', async () => {
    const a = fakeApi({
      emailState: async () => ({ email: null, email_verified: false, pending: false }),
      emailStart: async () => { throw new ApiError(409, 'email_in_use'); },
    });
    renderApp(<EmailCard onChange={() => undefined} />, { api: a });
    await userEvent.type(await screen.findByLabelText('E-mail address'), 'taken@example.org');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already verified on another account');
  });

  it('shows the translated reason when the code is wrong (pending state restored from the server)', async () => {
    const b = fakeApi({
      emailState: async () => ({ email: null, email_verified: false, pending: true }),
      emailVerify: async () => { throw new ApiError(400, 'invalid_code'); },
    });
    renderApp(<EmailCard onChange={() => undefined} />, { api: b });
    await userEvent.type(await screen.findByLabelText('E-mail code'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm e-mail' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
  });

  it('resend surfaces the one-minute limit', async () => {
    let n = 0;
    const a = fakeApi({
      emailState: async () => ({ email: null, email_verified: false, pending: false }),
      emailStart: async () => { if (++n > 1) throw new ApiError(429, 'email_code_resend_too_soon'); return { status: 'code_sent', expires_in: 600 }; },
    });
    renderApp(<EmailCard onChange={() => undefined} />, { api: a });
    await userEvent.type(await screen.findByLabelText('E-mail address'), 'a@example.org');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait a minute');
    expect(a.emailStart).toHaveBeenLastCalledWith('a@example.org');
  });

  it('remove asks first, then calls the API', async () => {
    const a = fakeApi({
      emailState: async () => ({ email: 'a@example.org', email_verified: true, pending: false }),
      emailRemove: async () => undefined,
    });
    renderApp(<EmailCard onChange={() => undefined} />, { api: a });
    expect(await screen.findByText('Confirmed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Remove e-mail' }));
    expect(await screen.findByRole('dialog', { name: 'Remove this e-mail address?' })).toBeInTheDocument();
    expect(a.emailRemove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(a.emailRemove).toHaveBeenCalled());
  });

  it('renders in Arabic with a right-to-left page', async () => {
    renderApp(<EmailCard onChange={() => undefined} />, { api: fakeApi({ emailState: async () => ({ email: null, email_verified: false, pending: false }) }), lang: 'ar' });
    expect(await screen.findByText('عنوان البريد الإلكتروني (اختياري)')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });
});
