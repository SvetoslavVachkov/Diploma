vi.mock('axios');

const axios = require('axios');
const { parseStatementWithAI } = require('./statementAiParseService');

describe('statementAiParseService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    axios.post = vi.fn();
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    process.env.HF_STMT_API_KEY = '';
    process.env.HF_STMT_MODEL = '';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses OpenAI as primary provider', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify([
                { date: '2026-04-01', description: 'Coffee', amount: 4.5, type: 'expense' }
              ])
            }
          }
        ]
      }
    });

    const result = await parseStatementWithAI('01.04.2026 Coffee 4.50 EUR', {});

    expect(result).toHaveLength(1);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
  });

  it('falls back to HuggingFace when OpenAI fails', async () => {
    axios.post
      .mockRejectedValueOnce(new Error('OpenAI failed'))
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { date: '2026-04-02', description: 'Salary', amount: 1000, type: 'income' }
                ])
              }
            }
          ]
        }
      });

    const result = await parseStatementWithAI('02.04.2026 Salary 1000', {
      apiKey: 'hf-key',
      model: 'hf-model'
    });

    expect(result).toHaveLength(1);
    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(axios.post.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(axios.post.mock.calls[1][0]).toBe('https://router.huggingface.co/v1/chat/completions');
  });

  it('falls back to Groq when OpenAI and HuggingFace fail', async () => {
    axios.post
      .mockRejectedValueOnce(new Error('OpenAI failed'))
      .mockRejectedValueOnce(new Error('HF failed'))
      .mockResolvedValueOnce({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { date: '2026-04-03', description: 'Transfer from', amount: 50, type: 'income' }
                ])
              }
            }
          ]
        }
      });

    const result = await parseStatementWithAI('03.04.2026 Transfer from 50 EUR', {
      apiKey: 'hf-key',
      model: 'hf-model',
      groqApiKey: 'groq-key',
      groqModel: 'llama'
    });

    expect(result).toHaveLength(1);
    expect(axios.post).toHaveBeenCalledTimes(3);
    expect(axios.post.mock.calls[2][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
  });

  it('filters invalid transaction rows from model output', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        choices: [
          {
            message: {
              content: JSON.stringify([
                { date: '2026-04-01', description: 'Valid', amount: 10, type: 'expense' },
                { date: 'bad-date', description: 'Bad date', amount: 11, type: 'expense' },
                { date: '2026-04-02', description: 'X', amount: 12, type: 'expense' },
                { date: '2026-04-03', description: 'Bad amount', amount: -2, type: 'expense' },
                { date: '2026-04-04', description: 'Bad type', amount: 4, type: 'unknown' }
              ])
            }
          }
        ]
      }
    });

    const result = await parseStatementWithAI('mock statement', {});

    expect(result).toEqual([
      { date: '2026-04-01', description: 'Valid', amount: 10, type: 'expense' }
    ]);
  });

  it('returns empty array when no provider keys are configured', async () => {
    process.env.OPENAI_API_KEY = '';

    const result = await parseStatementWithAI('mock statement', {});

    expect(result).toEqual([]);
    expect(axios.post).not.toHaveBeenCalled();
  });
});
