$(function() {
    var toc = $("#table-of-contents");
    if (toc) {
        // apply it
        var ul = toc.next('ul');
        ul.addClass('nav affix');
        ul.attr("role", "complementary")
        ul.children('li').children('ul').addClass('expand');

        var div = $('<div class="col-md-3 nav-toc">');
        div.append(ul);
        toc.remove();

        var root = $("#_root_div_");
        root.addClass("col-md-9")

        var newroot = $("<div class='container'>");
        var row = $("<div class='row'>");
        newroot.append(row)
        row.append(root);
        row.append(div);

        root.find('table').addClass('table');

        $("body").append(newroot);

        function updateToc() {
            ul.find('li > ul').not('.expand').addClass('collapse');
            ul.find('li.active > ul').removeClass('collapse');
        }

        $('body').on('activate.bs.scrollspy', function () {
          updateToc();
        });
        updateToc();
    }
});