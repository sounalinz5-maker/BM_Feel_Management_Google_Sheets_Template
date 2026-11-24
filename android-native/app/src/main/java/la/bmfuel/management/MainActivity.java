package la.bmfuel.management;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ContentValues;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.provider.MediaStore;
import android.view.View;
import android.view.Window;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.*;

public class MainActivity extends Activity {
    private static final String HOME="https://script.google.com/macros/s/AKfycbyyebQBgsCyX0BwYCH8Vls9KHb08tTRXKOWT1j2R38KadQqpaUIraXBOyMqFHeHHwbk/exec";
    private final int PICK=5, CAMERA=6;
    private FrameLayout root;
    private WebView main, child;
    private LinearLayout childPanel;
    private ValueCallback<Uri[]> fileCb;
    private Uri cameraUri;
    private PermissionRequest cameraRequest;

    @Override public void onCreate(Bundle b){
        super.onCreate(b);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.rgb(7,24,46));
        getWindow().setNavigationBarColor(Color.rgb(7,24,46));
        root=new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(7,24,46));
        setContentView(root);
        main=web();
        root.addView(main,new FrameLayout.LayoutParams(-1,-1));
        main.loadUrl(HOME);
    }

    private boolean trusted(Uri u){
        if(u==null || !"https".equalsIgnoreCase(u.getScheme()))return false;
        String h=u.getHost();
        if(h==null)return false;
        h=h.toLowerCase(java.util.Locale.ROOT);
        return h.equals("script.google.com") || h.equals("script.googleusercontent.com")
            || h.endsWith(".script.googleusercontent.com")
            || h.equals("sounalinz5-maker.github.io");
    }

    private boolean navigate(Uri u){
        if(trusted(u))return false;
        try{startActivity(new Intent(Intent.ACTION_VIEW,u));}
        catch(Exception e){Toast.makeText(this,"เปิดลิงก์ภายนอกไม่ได้",Toast.LENGTH_LONG).show();}
        return true;
    }

    private Uri photoUri(){
        try{
            ContentValues v=new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME,"BM_meter_"+System.currentTimeMillis()+".jpg");
            v.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");
            v.put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/BMFuel");
            return getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,v);
        }catch(Exception e){return null;}
    }

    private WebView web(){
        WebView w=new WebView(this);
        w.setBackgroundColor(Color.rgb(7,24,46));
        WebSettings s=w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w,true);
        w.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){return navigate(req.getUrl());}
            @Override public boolean shouldOverrideUrlLoading(WebView view,String url){return navigate(Uri.parse(url));}
        });
        w.setWebChromeClient(new WebChromeClient(){
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> cb,FileChooserParams p){
                if(fileCb!=null)fileCb.onReceiveValue(null);
                fileCb=cb;
                cameraUri=null;
                try{
                    Intent chooser=Intent.createChooser(p.createIntent(),"เลือกหรือถ่ายรูปมิเตอร์");
                    Intent camera=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    if(camera.resolveActivity(getPackageManager())!=null){
                        cameraUri=photoUri();
                        if(cameraUri!=null){
                            camera.putExtra(MediaStore.EXTRA_OUTPUT,cameraUri);
                            camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,new Intent[]{camera});
                        }
                    }
                    startActivityForResult(chooser,PICK);
                }catch(Exception ex){
                    fileCb.onReceiveValue(null);fileCb=null;
                    Toast.makeText(MainActivity.this,"ไม่สามารถเปิดตัวเลือกรูป",Toast.LENGTH_SHORT).show();
                }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest p){
                if(!trusted(p.getOrigin())){p.deny();return;}
                boolean video=false;
                for(String r:p.getResources())if(r.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE))video=true;
                if(!video){p.deny();return;}
                runOnUiThread(()->{
                    if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)
                        p.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    else {
                        if(cameraRequest!=null)cameraRequest.deny();
                        cameraRequest=p;
                        requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA);
                    }
                });
            }
            @Override public boolean onCreateWindow(WebView parent,boolean dialog,boolean gesture,Message result){
                if(!gesture||child!=null)return false;
                WebView pop=web();
                LinearLayout box=new LinearLayout(MainActivity.this);
                box.setOrientation(LinearLayout.VERTICAL);
                box.setBackgroundColor(Color.rgb(7,24,46));
                Button close=new Button(MainActivity.this);
                close.setText("กลับไปหน้า BM FUEL");
                close.setOnClickListener(v->closePop());
                box.addView(close,new LinearLayout.LayoutParams(-1,60));
                box.addView(pop,new LinearLayout.LayoutParams(-1,0,1));
                root.addView(box,new FrameLayout.LayoutParams(-1,-1));
                child=pop;childPanel=box;
                ((WebView.WebViewTransport)result.obj).setWebView(pop);
                result.sendToTarget();return true;
            }
            @Override public void onCloseWindow(WebView closed){if(closed==child)closePop();}
        });
        return w;
    }

    @Override protected void onActivityResult(int req,int status,Intent data){
        super.onActivityResult(req,status,data);
        if(req!=PICK||fileCb==null)return;
        Uri[] uris=null;
        if(status==RESULT_OK){
            if(data!=null&&data.getClipData()!=null){
                int n=data.getClipData().getItemCount();uris=new Uri[n];
                for(int i=0;i<n;i++)uris[i]=data.getClipData().getItemAt(i).getUri();
            }else if(data!=null&&data.getData()!=null)uris=new Uri[]{data.getData()};
            else if(cameraUri!=null)uris=new Uri[]{cameraUri};
        }else if(cameraUri!=null){
            try{getContentResolver().delete(cameraUri,null,null);}catch(Exception ignored){}
        }
        fileCb.onReceiveValue(uris);fileCb=null;cameraUri=null;
    }

    @Override public void onRequestPermissionsResult(int req,String[] perms,int[] grants){
        super.onRequestPermissionsResult(req,perms,grants);
        if(req!=CAMERA||cameraRequest==null)return;
        PermissionRequest p=cameraRequest;cameraRequest=null;
        if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)
            p.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        else p.deny();
    }

    private void closePop(){
        if(child==null)return;
        root.removeView(childPanel);
        child.destroy();
        child=null;childPanel=null;
    }

    @Override public void onBackPressed(){
        if(child!=null){if(child.canGoBack())child.goBack();else closePop();return;}
        if(main.canGoBack()){main.goBack();return;}
        new AlertDialog.Builder(this).setMessage("ออกจาก BM FUEL?")
            .setNegativeButton("ยกเลิก",null).setPositiveButton("ออก",(d,w)->finish()).show();
    }

    @Override public void onDestroy(){
        if(fileCb!=null){fileCb.onReceiveValue(null);fileCb=null;}
        if(cameraRequest!=null){cameraRequest.deny();cameraRequest=null;}
        closePop();
        if(main!=null)main.destroy();
        super.onDestroy();
    }
}