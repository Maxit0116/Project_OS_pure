declare module 'react-dom' {
  export function useFormState<State>(
    action: (state: State, payload: FormData) => Promise<State>,
    initialState: State,
  ): [State, (payload: FormData) => void]

  export function useFormStatus(): {
    pending: boolean
  }
}
