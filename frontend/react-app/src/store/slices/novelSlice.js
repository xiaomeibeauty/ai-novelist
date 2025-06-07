import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

// 异步 action 来创建小说文件
export const createNovelFile = createAsyncThunk(
  'novel/createNovelFile',
  async ({ title, content }, { rejectWithValue }) => {
    try {
      // 假设 window.ipcRenderer 可用 (由 Electron 预加载脚本注入)
      if (window.ipcRenderer) {
        // 调用主进程，传入文件标题和内容
        const result = await window.ipcRenderer.invoke('create-novel-file', { title, content });
        if (result.success) {
          return { newFilePath: result.newFilePath };
        } else {
          return rejectWithValue(result.error);
        }
      } else {
        // 非Electron环境下的模拟或错误处理
        console.warn('ipcRenderer is not available. Simulating file creation.');
        // 在非Electron环境下，可以模拟成功
        return { newFilePath: `novel/${title}.md` };
      }
    } catch (error) {
      console.error('Failed to create novel file:', error);
      return rejectWithValue(error.message);
    }
  }
);

// 异步 action 来更新小说文件标题
export const updateNovelTitle = createAsyncThunk(
  'novel/updateNovelTitle',
  async ({ oldFilePath, newTitle }, { rejectWithValue }) => {
    try {
      if (window.ipcRenderer) {
        const result = await window.ipcRenderer.invoke('update-novel-title', { oldFilePath, newTitle });
        if (result.success) {
          return { newFilePath: result.newFilePath };
        } else {
          return rejectWithValue(result.error);
        }
      } else {
        console.warn('ipcRenderer is not available. Simulating title update.');
        return { newFilePath: `novel/${newTitle}.md` }; // 模拟新的文件路径
      }
    } catch (error) {
      console.error('Failed to update novel title:', error);
      return rejectWithValue(error.message);
    }
  }
);

const novelSlice = createSlice({
  name: 'novel',
  initialState: {
    novelContent: '',
    currentFile: '未选择',
    chapters: [], // 用于存储章节列表
    status: 'idle', // 'idle' | 'loading' | 'succeeded' | 'failed'
    error: null,
    refreshCounter: 0, // 新增：用于触发章节列表刷新的计数器
  },
  reducers: {
    setNovelContent: (state, action) => {
      state.novelContent = action.payload;
    },
    setCurrentFile: (state, action) => {
      console.log('[novelSlice] setCurrentFile: payload:', action.payload); // 新增日志
      state.currentFile = action.payload;
    },
    setChapters: (state, action) => { // 设置章节列表
      state.chapters = action.payload;
    },
    triggerChapterRefresh: (state) => { // 用于触发章节列表刷新
      state.refreshCounter += 1; // 每次 dispatch 时递增计数器
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(createNovelFile.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(createNovelFile.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.currentFile = action.payload.newFilePath;
        state.novelContent = action.payload.content; // 新文件创建后加载其内容
      })
      .addCase(createNovelFile.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(updateNovelTitle.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(updateNovelTitle.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.currentFile = action.payload.newFilePath; // 更新当前文件路径为新路径
        // 还需要更新 chapters 列表中的文件路径
        state.chapters = state.chapters.map(chapter =>
          chapter === action.meta.arg.oldFilePath ? action.payload.newFilePath : chapter
        );
      })
      .addCase(updateNovelTitle.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      });
  },
});

export const { setNovelContent, setCurrentFile, setChapters, triggerChapterRefresh } = novelSlice.actions;
export default novelSlice.reducer;