import { useState, useEffect } from 'react';
import axios from 'axios';
import toast, { Toaster } from 'react-hot-toast';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser } from "@clerk/clerk-react";

function App() {
  const { user } = useUser(); // Grab the logged-in user from Clerk

  const [file, setFile] = useState(null);
  const [filter, setFilter] = useState('greyscale');
  const [resizeWidth, setResizeWidth] = useState('');
  const [rotation, setRotation] = useState('0');
  const [watermark, setWatermark] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [statusType, setStatusType] = useState(''); 
  const [galleryImages, setGalleryImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false); 
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchGallery = async (pageNum = 1) => {
    if (!user) return; // Don't fetch if no user is logged in
    
    try {
      if (pageNum > 1) setIsLoadingMore(true);
      
      // Pass the userId to the backend
      const response = await axios.get(`https://image-app-backend-zddd.onrender.com/api/images?page=${pageNum}&limit=8&userId=${user.id}`);
      
      if (pageNum === 1) {
        setGalleryImages(response.data.images);
      } else {
        setGalleryImages(prev => [...prev, ...response.data.images]);
      }
      
      setHasMore(response.data.hasMore);
      setPage(pageNum);
    } catch (error) {
      console.error("Failed to fetch gallery:", error);
      toast.error("Failed to load gallery images");
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Run whenever the user logs in or the component mounts
  useEffect(() => {
    if (user) {
      fetchGallery(1);
    }
  }, [user]);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setUploadStatus('');
    setStatusType('');
  };

  const handleUpload = async () => {
    if (!file) {
      setUploadStatus('Please select a file first.');
      setStatusType('error');
      return;
    }

    setIsUploading(true); 
    setStatusType('loading');
    setUploadStatus('Processing and uploading...');

    try {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
      const s3FileName = `${filter}___${safeFileName}`;

      const { data } = await axios.post('https://image-app-backend-zddd.onrender.com/api/upload-url', {
        fileName: s3FileName,
        fileType: file.type,
        edits: {
          width: resizeWidth,
          rotation: rotation,
          watermark: watermark
        }
      });

      await axios.put(data.uploadUrl, file, {
        headers: { 'Content-Type': file.type },
      });
      
      // Pass the user ID when saving metadata
      await axios.post('https://image-app-backend-zddd.onrender.com/api/images/metadata', {
        fileName: `processed-${safeFileName}`, 
        filterUsed: filter,
        userId: user.id
      });

      setUploadStatus('Upload successful!');
      setStatusType('success');
      setFile(null); 
      
      fetchGallery(1); 
      
    } catch (error) {
      console.error(error);
      setUploadStatus('Upload failed. Please try again.');
      setStatusType('error');
    } finally {
      setIsUploading(false); 
      setTimeout(() => setUploadStatus(''), 3000);
    }
  };

  const handleDelete = async (fileName) => {
    setGalleryImages(prev => prev.filter(img => img.key !== fileName));
    try {
      await axios.delete(`https://image-app-backend-zddd.onrender.com/api/images/${encodeURIComponent(fileName)}`);
      toast.success('Image deleted successfully');
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error('Failed to delete image');
      fetchGallery(1); 
    }
  };

  const handleDownload = async (url, fileName) => {
    try {
      const toastId = toast.loading('Getting download link...');
      
      // 1. Ask our backend for the special forced-download S3 URL
      const response = await axios.get(`https://image-app-backend-zddd.onrender.com/api/download-url?fileName=${encodeURIComponent(fileName)}`);
      
      // 2. Create a temporary invisible link and click it
      const link = document.createElement('a');
      link.href = response.data.downloadUrl;
      
      // We don't even need the blob anymore, the browser handles the download directly!
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Download started!', { id: toastId });
    } catch (error) {
      console.error("Download failed", error);
      toast.error('Failed to download image');
    }
  };

  const handleCleanRaw = async () => {
    const confirmDelete = window.confirm("⚠️ Are you sure you want to permanently delete all original images from the raw cloud bucket?");
    if (!confirmDelete) return;

    setIsCleaning(true);
    const cleanDbPromise = axios.delete('https://image-app-backend-zddd.onrender.com/api/clean-raw');

    toast.promise(cleanDbPromise, {
      loading: 'Emptying raw bucket...',
      success: 'Raw bucket cleaned successfully! 🗑️',
      error: 'Could not clean the bucket.',
    });

    try {
      await cleanDbPromise;
    } catch (error) {
      console.error("Error cleaning bucket:", error);
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <Toaster position="bottom-right" />
      
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
            <span className="font-semibold text-lg tracking-tight text-white">CloudLens Studio</span>
          </div>
          
          <div className="flex items-center gap-4">
            <SignedIn>
              <button 
                onClick={handleCleanRaw}
                disabled={isCleaning}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCleaning ? "Cleaning..." : "Clean Raw DB"}
              </button>
              <UserButton />
            </SignedIn>
          </div>
        </div>
      </nav>

      <SignedOut>
        <div className="max-w-xl mx-auto mt-32 text-center space-y-6 px-6">
          <h1 className="text-4xl font-bold text-white tracking-tight">Welcome to CloudLens Studio</h1>
          <p className="text-slate-400 text-lg">Sign in to securely upload, process, and store your images in the cloud.</p>
          <div className="pt-8">
            <SignInButton mode="modal">
              <button className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-full font-semibold shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all duration-200">
                Sign In / Sign Up
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-xl max-w-2xl mx-auto">
            <header className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Process an Image</h2>
              <p className="text-slate-400 text-sm">Upload a photo to securely process and store it in the cloud.</p>
            </header>

            <div className="space-y-6">
              <label className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-slate-700 border-dashed rounded-xl cursor-pointer bg-slate-900/50 hover:bg-slate-800 hover:border-blue-500 transition-all duration-200 group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                  <svg className="w-10 h-10 mb-3 text-slate-500 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                  {file ? (
                    <p className="text-sm font-medium text-blue-400 truncate max-w-[250px]">{file.name}</p>
                  ) : (
                    <>
                      <p className="mb-1 text-sm text-slate-300 font-medium"><span className="text-blue-500">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-slate-500">PNG, JPG, JPEG up to 10MB</p>
                    </>
                  )}
                </div>
                <input type="file" className="hidden" onChange={handleFileChange} accept="image/*" />
              </label>

              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="relative w-full sm:w-1/2">
                  <select 
                    value={filter} 
                    onChange={(e) => setFilter(e.target.value)} 
                    className="w-full appearance-none bg-slate-950 border border-slate-700 text-slate-200 py-3 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    <option value="greyscale">Black & White</option>
                    <option value="blur">Blur (5px)</option>
                    <option value="sepia">Vintage Sepia</option>
                    <option value="invert">Invert Colors</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>

                <button 
                  onClick={handleUpload} 
                  disabled={isUploading || !file}
                  className={`w-full sm:w-1/2 flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-medium transition-all duration-200 ${
                    isUploading || !file 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                  }`}
                >
                  {isUploading ? "Processing..." : "Process & Upload"}
                </button>
              </div>

              {/* 🌟 NEW EDITING CONTROLS */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                
                {/* Resize Width */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Resize Width (px)</label>
                  <input 
                    type="number" 
                    placeholder="e.g. 800" 
                    value={resizeWidth}
                    onChange={(e) => setResizeWidth(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 py-2 px-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Rotation */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Rotation (degrees)</label>
                  <select 
                    value={rotation}
                    onChange={(e) => setRotation(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 py-2 px-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="0">None</option>
                    <option value="90">90° Right</option>
                    <option value="180">180° Upside Down</option>
                    <option value="270">90° Left</option>
                  </select>
                </div>

                {/* Watermark Text */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Watermark Text</label>
                  <input 
                    type="text" 
                    placeholder="e.g. @MyStudio" 
                    value={watermark}
                    onChange={(e) => setWatermark(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 py-2 px-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {uploadStatus && (
                <div className={`p-4 rounded-lg border text-sm flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 ${
                  statusType === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                  statusType === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                  'bg-blue-500/10 border-blue-500/20 text-blue-400'
                }`}>
                  {uploadStatus}
                </div>
              )}
            </div>
          </section>

          <section className="pt-4 border-t border-slate-800/50">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-white">Processed Gallery</h2>
              <button 
                onClick={() => fetchGallery(1)} 
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-900 border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Refresh
              </button>
            </div>

            {galleryImages.length === 0 ? (
               <div className="text-center py-20 border border-slate-800 border-dashed rounded-2xl bg-slate-900/30">
                 <p className="text-slate-500">Your gallery is empty. Upload an image to get started.</p>
               </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
                  {galleryImages.map((image) => (
                    <div key={image.key} className="group relative overflow-hidden rounded-xl bg-slate-900 border border-slate-800 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 aspect-square">
                      <img 
                        src={image.url} 
                        alt={image.key} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-5">
                        <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2 border border-blue-500/20">
                            {image.filterUsed || 'Standard'}
                          </span>
                          <p className="text-slate-300 text-xs truncate w-full mb-3">
                            {image.uploadDate ? new Date(image.uploadDate).toLocaleDateString() : 'Just now'}
                          </p>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleDownload(image.url, image.key)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600/90 hover:bg-blue-500 text-white text-sm font-medium rounded-lg backdrop-blur-sm transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                              Save
                            </button>
                            <button 
                              onClick={() => handleDelete(image.key)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-red-500/90 hover:bg-red-500 text-white text-sm font-medium rounded-lg backdrop-blur-sm transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={() => fetchGallery(page + 1)}
                      disabled={isLoadingMore}
                      className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-full font-medium transition-colors disabled:opacity-50"
                    >
                      {isLoadingMore ? (
                        <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      )}
                      {isLoadingMore ? 'Loading...' : 'Load More Images'}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </main>
      </SignedIn>
    </div>
  );
}

export default App;