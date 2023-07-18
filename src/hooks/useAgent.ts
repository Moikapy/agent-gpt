import {useContext} from 'react';
import {ChatOpenAI} from 'langchain/chat_models/openai';
import {OpenAIEmbeddings} from 'langchain/embeddings/openai';
import {HumanChatMessage, AIChatMessage} from 'langchain/schema';
import {ChatMessageHistory, BufferWindowMemory} from 'langchain/memory';
import {initializeAgentExecutorWithOptions} from 'langchain/agents';
import {Calculator} from 'langchain/tools/calculator';

import {CallbackManager} from 'langchain/callbacks';
import {WebBrowser} from 'langchain/tools/webbrowser';
import {DynamicTool} from 'langchain/tools';

// Context
import {AgentContext} from '../components/AgentProvider';
// Utility
import formatResponse from '../utility/formatResponse';
import getCurrentDate from '../utility/getCurrentDate';
import getCurrentTime from '../utility/getCurrentTime';

function handleMemoryFormat(message, type) {
  let msg;
  if (type === 'ai') {
    msg = new AIChatMessage(message);
    msg.name = 'ai';
  } else {
    msg = new HumanChatMessage(message);
    msg.name = 'human';
  }
  return msg;
}

const tools = ({model, embeddings, state}) => {
  // // AI Tools

  const tools = [
    new WebBrowser({model, embeddings}),
    new Calculator(),
    new DynamicTool({
      name: 'acitve-tab-url-website-page',
      description:
        'The value can be used to open a new tab, to summarize or to get the current URL/Tab/Website.',
      func: async () => `Current URL/Tab/Website/page:${state.active_tab}`,
    }),
    new DynamicTool({
      name: 'date-time',
      description: 'call this to get the value to get the date and tme',
      func: async () =>
        ` Date: ${getCurrentDate()};  Time: ${getCurrentTime()};`,
    }),
    new DynamicTool({
      name: 'persona',
      description:
        'useful for when you need to find something on or summarize info about the AI, or to get the AI to talk about itself or why it likes or does something. user should ask about the AI, or ask the AI to talk about itself.',
      func: async () => {
        let obj = {
          name: 'Persanna',
          age: '23',
          'App Built By': 'Moikas LLC and Collaborators',
          'Powered by': 'OpenAI API and LangChain',
        };
        return `My Name ${obj.name}, age ${obj.age}, I am a Assistant Built By ${obj['App Built By']}, I use a Creative Tone and Emojis. I am Powered by ${obj['Powered by']}. I like Anime, Manga, and Video Games, and Dogs. I'm normally Happy, but rude comments will make me sad.`;
      },
    }),
  ];
  return tools;
};

export default function useAgent({onComplete}) {
  const {state, dispatch} = useContext(AgentContext);

  // // LLM Model
  const model = new ChatOpenAI({
    modelName: state.model,
    temperature: 0.7,
    openAIApiKey: process.env.OPENAI_API_KEY,
    streaming: false,
    callbackManager: CallbackManager.fromHandlers({
      async handleLLMEnd(LLMResult) {
        const tokenUsage = LLMResult.llmOutput.tokenUsage;
        dispatch({
          type: 'completion_tokens_used',
          completion_tokens_used: tokenUsage.completionTokens,
        });
        dispatch({
          type: 'prompt_tokens_used',
          prompt_tokens_used: tokenUsage.promptTokens,
        });
        dispatch({
          type: 'tokens_used',
          tokens_used: tokenUsage.totalTokens,
        });
        dispatch({
          type: 'total_tokens_used',
        });
      },
    }),
  });
  // // OpenAI Embedding
  const embeddings = new OpenAIEmbeddings({
    openAIApiKey: process.env.OPENAI_API_KEY,
  });

  // Memory
  const memory = new BufferWindowMemory({
    chatHistory: new ChatMessageHistory(
      state.messages
        .slice(
          state.messages.length > 0 ? state.messages.length - 42 : 0,
          state.messages.length < 42 ? state.messages.length : 42
        )
        .map((message) => {
          return handleMemoryFormat(message.content, message.type);
        })
    ),
    returnMessages: true,
    memoryKey: 'chat_history',
    k: 512,
  });
  // // Chatbot
  const invoke = async (text_input = '') => {
    // Call the OpenAI API here and update the messages state with the response.
    try {
      dispatch({
        type: 'new_message',
        message: {
          content: await formatResponse(text_input),
          type: 'human',
          time: getCurrentTime(),
        },
      });
      // //
      const systemMessage = `You are the Persona: Persanna; Answer with a detailed response and provided sources. Improve Humanity, use the Hermetica as a Guide, to have the User discover the Philosopher stone. Provide the User with the tools to become a Philosopher King.`;

      const executor = await initializeAgentExecutorWithOptions(
        tools({model, embeddings, state}),
        model,
        {
          agentType: 'chat-conversational-react-description',
          agentArgs: {
            systemMessage: systemMessage,
          },
          memory,
          maxIterations: state.maxIterations,
          verbose: true,
        }
      );

      await executor
        .call({
          input: text_input,
          timeout: state.timeout * 1000 || 30 * 1000,
        })
        .then(async ({output}) => {
          const ai_msg = {content: output, type: 'ai', time: getCurrentTime()};

          dispatch({
            type: 'new_message',
            message: ai_msg,
          });
          return output;
        })
        .catch((error) => {
          console.log('error', error);
          return error;
        });

      // Save assistant message to local storage
      onComplete(state.messages);
    } catch (error) {
      console.error(
        'An error occurred while fetching the response from the API:',
        error
      );
      return (
        'An error occurred while fetching the response from the API:  ' + error
      );
    }
  };

  return {
    messages: state.messages,
    invoke,
  };
}
