import http.server, ssl, sys, os
os.chdir(sys.argv[1])
httpd = http.server.HTTPServer(('127.0.0.1', int(sys.argv[2])), http.server.SimpleHTTPRequestHandler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('cert.pem', 'key.pem')
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print('jwks https ready', flush=True)
httpd.serve_forever()
