const ipcRenderer = window.ipcRenderer;

export const saveCheckpoint = async (taskId, message) => {
  try {
    const result = await ipcRenderer.invoke('checkpoints:save', { taskId, message });
    return result;
  } catch (error) {
    console.error('Error saving checkpoint:', error);
    throw error;
  }
};

export const restoreCheckpoint = async (taskId, commitHash) => {
  try {
    const result = await ipcRenderer.invoke('checkpoints:restore', { taskId, commitHash });
    return result;
  } catch (error) {
    console.error('Error restoring checkpoint:', error);
    throw error;
  }
};

export const getDiff = async (taskId, from, to) => {
  try {
    const result = await ipcRenderer.invoke('checkpoints:getDiff', { taskId, from, to });
    return result;
  } catch (error) {
    console.error('Error getting diff:', error);
    throw error;
  }
};

// We also need a way to get the checkpoint history.
// I'll add the handler for this in the backend, and the function here.
export const getHistory = async (taskId) => {
  try {
    const result = await ipcRenderer.invoke('checkpoints:getHistory', { taskId });
    return result;
  } catch (error) {
    console.error('Error getting history:', error);
    throw error;
  }
};