using Microsoft.Web.WebView2.WinForms;

var url = args.Length > 0 ? args[0] : "http://localhost:5173/";

ApplicationConfiguration.Initialize();

var screen = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1080, 1920);
var margin = 8;
var availW = Math.Max(360, screen.Width - margin * 2);
var availH = Math.Max(640, screen.Height - margin * 2);
var width = Math.Min(availW / 9, availH / 16) * 9;
var height = width / 9 * 16;
var x = screen.X + margin;
var y = screen.Y + Math.Max(0, (screen.Height - height) / 2);
var size = new Size(width, height);

var form = new Form
{
    Text = "Aurora",
    FormBorderStyle = FormBorderStyle.None,
    StartPosition = FormStartPosition.Manual,
    Bounds = new Rectangle(x, y, width, height),
    MinimumSize = size,
    MaximumSize = size,
    BackColor = Color.FromArgb(5, 6, 10),
    MaximizeBox = false,
    KeyPreview = true,
};

var web = new WebView2
{
    Dock = DockStyle.Fill,
    DefaultBackgroundColor = Color.FromArgb(5, 6, 10),
};
form.Controls.Add(web);
form.KeyDown += (_, e) =>
{
    if (e.KeyCode == Keys.Escape) form.Close();
};
form.Resize += (_, _) =>
{
    if (form.WindowState != FormWindowState.Normal) form.WindowState = FormWindowState.Normal;
    if (form.ClientSize != size) form.ClientSize = size;
};

form.Shown += async (_, _) =>
{
    try
    {
        await web.EnsureCoreWebView2Async();
        web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        web.CoreWebView2.Settings.IsStatusBarEnabled = false;
        web.CoreWebView2.Settings.IsZoomControlEnabled = false;
        web.CoreWebView2.Settings.IsPinchZoomEnabled = false;
        web.ZoomFactor = 1;
        web.Source = new Uri(url);
    }
    catch (Exception ex)
    {
        MessageBox.Show(form, ex.Message, "Aurora");
    }
};

Application.Run(form);
