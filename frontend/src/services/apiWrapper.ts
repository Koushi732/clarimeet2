import realApi, { audioApi, sessionApi, transcriptionApi, summarizationApi } from './api';
import mockApi, { mockAudioApi, mockSessionApi, mockTranscriptionApi, mockSummarizationApi } from './mockApi';

// Environment variable or global setting to determine which API to use
// In a real app, you might use process.env.REACT_APP_USE_MOCK_API or a similar approach
// For now, we'll default to using the mock API
const USE_MOCK_API = true;

// Wrapper for all API services
const api = USE_MOCK_API ? mockApi : realApi;
export const audioApiWrapper = USE_MOCK_API ? mockAudioApi : audioApi;
export const sessionApiWrapper = USE_MOCK_API ? mockSessionApi : sessionApi;
export const transcriptionApiWrapper = USE_MOCK_API ? mockTranscriptionApi : transcriptionApi;
export const summarizationApiWrapper = USE_MOCK_API ? mockSummarizationApi : summarizationApi;

export default api;
